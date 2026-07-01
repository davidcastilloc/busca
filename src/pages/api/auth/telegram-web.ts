import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { verifyTelegramWidgetAuth } from "../../../lib/telegram/utils";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const { DB, TELEGRAM_BOT_TOKEN } = env as any;
    if (!DB || !TELEGRAM_BOT_TOKEN) {
      return new Response("Configuración del servidor incompleta.", { status: 500 });
    }

    const url = new URL(context.request.url);
    const data = Object.fromEntries(url.searchParams.entries());
    const { hash, id, first_name } = data;

    if (!hash || !id) {
      return new Response("Datos de Telegram incompletos.", { status: 400 });
    }

    // 1. Validar firma HMAC de Telegram
    const isValid = await verifyTelegramWidgetAuth(data, TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return new Response("Firma de Telegram no válida.", { status: 401 });
    }

    const telegramId = String(id);

    // 2. Buscar si el voluntario ya tiene este telegram_id vinculado
    const voluntario = await DB.prepare(`
      SELECT * FROM voluntarios 
      WHERE telegram_id = ? AND activo = 1
    `).bind(telegramId).first() as { id: number; nombre: string } | null;

    if (voluntario) {
      // 3a. El usuario EXISTE: Iniciar sesión
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 días

      await DB.prepare(`
        INSERT INTO sesiones_voluntarios (token, voluntario_id, expires_at, created_at)
        VALUES (?, ?, ?, datetime('now', '-4 hours'))
      `).bind(
        token,
        voluntario.id,
        expiresAt.toISOString()
      ).run();

      // Configurar cookie
      context.cookies.set("session_token", token, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30
      });

      // Redirigir como 302 porque es un GET request del navegador
      return Response.redirect(new URL("/ayudar", context.request.url), 302);
    } else {
      // 3b. El usuario NO EXISTE: Redirigir para completar registro
      // Guardamos la verificación temporal en una cookie segura y corta (1 hora)
      // para que el usuario pueda completar su registro (PIN y teléfono) sin volver a loguearse con Telegram.
      
      const tempToken = crypto.randomUUID();
      const tempAuthData = JSON.stringify({
        tg_id: telegramId,
        first_name: first_name || "Voluntario",
        verified_at: Date.now()
      });
      
      // En una implementación real más robusta, este token temporal se guardaría en KV o D1 con expiración.
      // Aquí lo pasamos firmado o guardado en cookie. Usaremos una cookie HTTP-only temporal.
      context.cookies.set("tg_pending_auth", tempAuthData, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 // 1 hora
      });

      // Redirigir al usuario al formulario para completar su registro
      return Response.redirect(new URL("/ayudar?register=telegram", context.request.url), 302);
    }
  } catch (error: any) {
    console.error("Error en auth telegram web:", error);
    return new Response(error.message, { status: 500 });
  }
};
