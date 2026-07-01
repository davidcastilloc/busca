import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ReporteSchema } from "../../lib/validators";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const body = await context.request.json();

    const validated = ReporteSchema.parse(body);

    // Adjuntar voluntario_id si está logueado
    const sessionToken = context.cookies.get("session_token")?.value;
    if (sessionToken && DB) {
      const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
      if (voluntario) {
        validated.created_by = voluntario.id;
      }
    }

    if (import.meta.env.DEV) {
      const { procesarCola } = await import("../../lib/queue-processor");
      const mockBatch = {
        messages: [{
          body: {
            type: "reporte",
            data: validated
          },
          ack: () => {}
        }]
      };
      await procesarCola(mockBatch as any, env);
    } else {
      await env.CENSO_QUEUE.send({
        type: "reporte",
        data: validated
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Reporte de emergencia encolado" }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar reporte:", error);
    return new Response(JSON.stringify({ error: error.message || "Datos del reporte inválidos" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};
