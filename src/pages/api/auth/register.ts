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
    const { nombre, telefono, pin } = body;

    // Validar requeridos
    if (!nombre || !telefono || !pin) {
      return new Response(JSON.stringify({ error: "Nombre, teléfono y PIN son obligatorios." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cleanedTelefono = telefono.replace(/[^0-9+]/g, "").trim();
    const cleanedPin = pin.replace(/[^0-9]/g, "").trim();

    if (cleanedPin.length !== 4) {
      return new Response(JSON.stringify({ error: "El PIN debe ser exactamente de 4 dígitos numéricos." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Hashear PIN
    const pinHash = await hashPIN(cleanedPin);

    // Insertar en D1
    let voluntarioId: number;
    try {
      const res = await DB.prepare(`
        INSERT INTO voluntarios (nombre, telefono, pin_hash, activo, created_at)
        VALUES (?, ?, ?, 1, datetime('now', '-4 hours'))
        RETURNING id
      `).bind(
        nombre.trim(),
        cleanedTelefono,
        pinHash
      ).first<{ id: number }>();

      if (!res?.id) {
        throw new Error("No se obtuvo ID del voluntario.");
      }
      voluntarioId = res.id;
    } catch (dbErr: any) {
      if (dbErr.message && dbErr.message.includes("UNIQUE constraint failed")) {
        return new Response(JSON.stringify({ error: "Ya existe un voluntario registrado con este número de teléfono." }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }
      throw dbErr;
    }

    // Crear sesión
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 días

    await DB.prepare(`
      INSERT INTO sesiones_voluntarios (token, voluntario_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now', '-4 hours'))
    `).bind(
      token,
      voluntarioId,
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

    return new Response(JSON.stringify({ success: true, nombre: nombre.trim() }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar voluntario:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
