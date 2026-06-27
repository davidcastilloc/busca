import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";

export const prerender = false;

const AlertaSchema = z.object({
  titulo: z.string().min(1).max(100),
  mensaje: z.string().min(1).max(500),
  tipo: z.enum(["evacuacion", "replica", "info"]),
  url_destino: z.string().optional().default("/"),
});

// POST: Enviar alerta push masiva a todos los voluntarios suscritos
export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const validated = AlertaSchema.parse(body);

    const { DB } = env;
    const PUSH_QUEUE = (env as any).PUSH_QUEUE;

    if (!PUSH_QUEUE) {
      return new Response(
        JSON.stringify({ error: "PUSH_QUEUE no configurada" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obtener todas las suscripciones activas
    const result = await DB.prepare(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'voluntario'"
    ).all<{ endpoint: string; p256dh: string; auth: string }>();

    const suscripciones = result.results || [];

    if (suscripciones.length === 0) {
      return new Response(
        JSON.stringify({ success: true, enviados: 0, mensaje: "No hay suscriptores activos" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Agrupar suscripciones en batches de 50 para la cola
    const BATCH_SIZE = 50;
    const batches: typeof suscripciones[] = [];
    for (let i = 0; i < suscripciones.length; i += BATCH_SIZE) {
      batches.push(suscripciones.slice(i, i + BATCH_SIZE));
    }

    // Encolar cada batch
    for (const batch of batches) {
      await PUSH_QUEUE.send({
        type: "push_batch",
        payload: {
          titulo: validated.titulo,
          mensaje: validated.mensaje,
          tipo: validated.tipo,
          url: validated.url_destino,
        },
        suscripciones: batch.map((s) => ({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        })),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        enviados: suscripciones.length,
        batches: batches.length,
        mensaje: `Alerta encolada para ${suscripciones.length} dispositivos en ${batches.length} lotes`,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error al enviar alerta push:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al procesar alerta" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
};
