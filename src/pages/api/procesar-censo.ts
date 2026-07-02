import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const POST: APIRoute = async (context) => {
  const { request, cookies } = context;
  try {
    const { DB } = env;
    const sessionToken = cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    const voluntarioId = voluntario ? voluntario.id : null;

    const data = await request.json();
    const personas = data.personas as {nombre: string, cedula: number|null, telefono: string|null, edad: number|null}[];
    const refugio = data.refugio as string || "Desconocido";
    const contacto = data.contacto as string || "";
    const refugio_id = data.refugio_id || null;

    if (!personas || !Array.isArray(personas) || personas.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "La lista de personas está vacía o es inválida." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { procesarCensoBatch } = await import("../../lib/db");
    const { results } = await procesarCensoBatch(
      DB,
      personas,
      refugio,
      contacto,
      refugio_id,
      voluntarioId
    );

    const triggerPushNotifications = async () => {
      try {
        const PUSH_QUEUE = env.PUSH_QUEUE;
        if (!PUSH_QUEUE) return;

        let familiarSubscriptions: any[] | null = null;

        for (const res of results) {
          if (res.matches.length > 0) {
            if (familiarSubscriptions === null) {
              const subRes = await DB.prepare(
                "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'familiar'"
              ).all<{ endpoint: string; p256dh: string; auth: string }>();
              familiarSubscriptions = subRes.results || [];
            }

            if (familiarSubscriptions.length > 0) {
              const BATCH_SIZE = 50;
              for (const reporte of res.matches) {
                for (let i = 0; i < familiarSubscriptions.length; i += BATCH_SIZE) {
                  const subBatch = familiarSubscriptions.slice(i, i + BATCH_SIZE);
                  await PUSH_QUEUE.send({
                    type: "push_batch",
                    payload: {
                      titulo: "¡Familiar Encontrado!",
                      mensaje: `${reporte.nombre_buscado} ha sido registrado localizado en el refugio: ${refugio || "Refugio de emergencia"}.`,
                      tipo: "info",
                      url: `/?q=${encodeURIComponent(reporte.nombre_buscado)}`
                    },
                    suscripciones: subBatch.map((s) => ({
                      endpoint: s.endpoint,
                      keys: { p256dh: s.p256dh, auth: s.auth }
                    }))
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Error al enviar notificaciones push del censo:", err);
      }
    };

    const cfContext = context.locals.cfContext || context.locals.runtime?.ctx;
    if (cfContext?.waitUntil) {
      cfContext.waitUntil(triggerPushNotifications());
    } else {
      await triggerPushNotifications();
    }

    return new Response(JSON.stringify({ success: true, count: personas.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al encolar censo curado:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
