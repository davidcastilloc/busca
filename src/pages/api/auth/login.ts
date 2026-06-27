import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashPIN } from "../../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) {
      return new Response(JSON.stringify({ error: "Base de datos no disponible." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const { telefono, pin } = body;

    if (!telefono || !pin) {
      return new Response(JSON.stringify({ error: "Teléfono y PIN son requeridos." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanedTelefono = telefono.replace(/[^0-9+]/g, "").trim();
    const cleanedPin = pin.replace(/[^0-9]/g, "").trim();

    // Buscar voluntario
    const voluntario = await DB.prepare(`
      SELECT * FROM voluntarios 
      WHERE telefono = ? AND activo = 1
    `).bind(cleanedTelefono).first<{ id: number; nombre: string; pin_hash: string }>();

    if (!voluntario) {
      return new Response(JSON.stringify({ error: "Voluntario no registrado o desactivado." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Hashear PIN ingresado y comparar
    const inputHash = await hashPIN(cleanedPin);
    if (inputHash !== voluntario.pin_hash) {
      return new Response(JSON.stringify({ error: "Teléfono o PIN incorrectos." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Generar sesión
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 días

    await DB.prepare(`
      INSERT INTO sesiones_voluntarios (token, voluntario_id, expires_at)
      VALUES (?, ?, ?)
    `).bind(
      token,
      voluntario.id,
      expiresAt.toISOString()
    ).run();

    // Establecer cookie
    context.cookies.set("session_token", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30 // 30 días
    });

    return new Response(JSON.stringify({ success: true, nombre: voluntario.nombre }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al iniciar sesión de voluntario:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
