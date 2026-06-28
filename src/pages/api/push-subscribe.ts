import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";

export const prerender = false;

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  rol: z.enum(["voluntario", "admin", "familiar"]).default("voluntario"),
});

// POST: Suscribir dispositivo a notificaciones push
export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const validated = SubscriptionSchema.parse(body);

    const { DB } = env;

    // UPSERT: si el endpoint ya existe, actualizar keys
    await DB.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, rol)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        rol = excluded.rol,
        created_at = datetime('now', '-4 hours')
    `).bind(
      validated.endpoint,
      validated.keys.p256dh,
      validated.keys.auth,
      validated.rol
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error al guardar suscripción push:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Datos de suscripción inválidos" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
};

// DELETE: Desuscribir dispositivo
export const DELETE: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "Endpoint requerido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { DB } = env;
    await DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
      .bind(endpoint)
      .run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error al eliminar suscripción push:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
