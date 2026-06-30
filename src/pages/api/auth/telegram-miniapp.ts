import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { verifyTelegramInitData } from "../../../lib/telegram/utils";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB, TELEGRAM_BOT_TOKEN } = env as any;
    if (!DB) {
      return new Response(JSON.stringify({ error: "Base de datos no disponible." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Token del bot de Telegram no configurado." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const { initData } = body;

    if (!initData) {
      return new Response(JSON.stringify({ error: "Parámetro initData es requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Validar firma de Telegram
    const isValid = await verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN as string);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Firma de Telegram no válida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Extraer usuario de initData
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) {
      return new Response(JSON.stringify({ error: "Datos de usuario no encontrados en initData." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const tgUser = JSON.parse(userJson);
    const telegramId = String(tgUser.id);

    // 3. Buscar voluntario en D1
    const voluntario = await DB.prepare(`
      SELECT * FROM voluntarios 
      WHERE telegram_id = ? AND activo = 1
    `).bind(telegramId).first() as { id: number; nombre: string } | null;

    if (!voluntario) {
      return new Response(
        JSON.stringify({ 
          error: "Voluntario no registrado en el sistema. Asegúrate de vincular tu cuenta con /login primero." 
        }), 
        {
          status: 403,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 4. Crear sesión
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

    // 5. Configurar cookie
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
    console.error("Error en autenticación de Telegram MiniApp:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
