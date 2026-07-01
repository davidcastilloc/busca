import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB, TELEGRAM_BOT_TOKEN } = env;

    // 1. Validar autenticación
    const sessionToken = context.cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    if (!voluntario) {
      return new Response(JSON.stringify({ error: "No autorizado. Inicie sesión como voluntario." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN no configurado" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const { chat_id, text } = body;

    if (!chat_id || !text) {
      return new Response(JSON.stringify({ error: "Faltan datos requeridos (chat_id, text)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Enviar mensaje a través de Telegram API
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chat_id,
        text: text
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("Error enviando mensaje a Telegram:", data);
      return new Response(JSON.stringify({ error: "Error enviando el mensaje", details: data }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en API telegram-msg:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
