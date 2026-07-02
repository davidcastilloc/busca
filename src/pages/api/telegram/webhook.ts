import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { processTelegramUpdate } from "../../../lib/telegram/bot";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const cfEnv = env as unknown as Env;
    const url = new URL(context.request.url);
    const secret = url.searchParams.get("secret");

    // Verificar token secreto si está configurado en variables
    const expectedSecret = cfEnv.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await context.request.json();

    // Procesar asíncronamente usando waitUntil si está disponible para evitar bloqueos
    const cfContext = context.locals.cfContext || context.locals.runtime?.ctx;
    const promise = processTelegramUpdate(update, cfEnv);

    if (cfContext?.waitUntil) {
      cfContext.waitUntil(promise);
    } else {
      // Degradación graciosa para entornos locales de desarrollo
      await promise;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error en webhook de Telegram:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
