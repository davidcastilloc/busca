import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import crypto from "node:crypto";

export const prerender = false;

// Helpers para hashear PIN (asumiendo que en la app usan SHA-256)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env as any;
    if (!DB) {
      return new Response(JSON.stringify({ error: "Configuración del servidor incompleta." }), { status: 500 });
    }

    // 1. Validar cookie de sesión temporal
    const tempAuthCookie = context.cookies.get("tg_pending_auth")?.value;
    if (!tempAuthCookie) {
      return new Response(JSON.stringify({ error: "Sesión de registro expirada. Inicia sesión con Telegram nuevamente." }), { status: 401 });
    }

    let tgData;
    try {
      tgData = JSON.parse(tempAuthCookie);
    } catch {
      return new Response(JSON.stringify({ error: "Datos de sesión corruptos." }), { status: 400 });
    }

    const { tg_id, first_name, verified_at } = tgData;
    if (!tg_id) {
      return new Response(JSON.stringify({ error: "ID de Telegram inválido." }), { status: 400 });
    }

    // Validar expiración (1 hora) por seguridad extra
    if (Date.now() - verified_at > 60 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "La sesión ha expirado." }), { status: 401 });
    }

    // 2. Obtener datos del formulario
    const data = await context.request.json();
    const { telefono, pin, rol, aceptarTerminos } = data;

    if (!telefono || !pin || pin.length !== 4) {
      return new Response(JSON.stringify({ error: "Datos incompletos o PIN inválido (debe ser de 4 dígitos)." }), { status: 400 });
    }

    if (!aceptarTerminos) {
      return new Response(JSON.stringify({ error: "Debes aceptar los Términos y Condiciones y la Política de Privacidad." }), { status: 400 });
    }

    // Limpiar teléfono
    const cleanPhone = telefono.replace(/[^0-9]/g, "").trim();

    // 3. Buscar si el teléfono ya existe
    const existente = await DB.prepare(`SELECT * FROM voluntarios WHERE telefono = ?`).bind(cleanPhone).first();
    let voluntarioId: number;

    if (existente) {
      // El teléfono ya existe, vincular la cuenta
      // Debemos validar que el PIN coincida para evitar robo de cuentas
      const pinToVerify = await hashPin(pin);
      if (existente.pin_hash !== pinToVerify) {
        return new Response(JSON.stringify({ error: "El teléfono ya está registrado y el PIN es incorrecto. Si olvidaste tu PIN, contacta a un administrador." }), { status: 401 });
      }

      // Actualizar el telegram_id
      await DB.prepare(`UPDATE voluntarios SET telegram_id = ? WHERE id = ?`).bind(tg_id, existente.id).run();
      voluntarioId = existente.id;
    } else {
      // Crear nueva cuenta
      const nuevoPinHash = await hashPin(pin);
      const res = await DB.prepare(`
        INSERT INTO voluntarios (nombre, telefono, pin_hash, rol, telegram_id, activo)
        VALUES (?, ?, ?, ?, ?, 1)
      `).bind(first_name, cleanPhone, nuevoPinHash, rol || 'general', tg_id).run();
      
      voluntarioId = res.meta.last_row_id as number;
    }

    // 4. Iniciar sesión oficialmente
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

    // Eliminar cookie temporal y configurar la oficial
    context.cookies.delete("tg_pending_auth", { path: "/" });
    
    context.cookies.set("session_token", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30
    });

    return new Response(JSON.stringify({ success: true, redirect: "/ayudar" }), { status: 200 });

  } catch (error: any) {
    console.error("Error en auth telegram register:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
