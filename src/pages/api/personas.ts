import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { PersonaSchema } from "../../lib/validators";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const sessionToken = context.cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);

    if (!voluntario) {
      return new Response(JSON.stringify({ error: "No autorizado. Inicie sesión como voluntario." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();

    const validated = PersonaSchema.parse(body);
    validated.created_by = voluntario.id;

    if (import.meta.env.DEV) {
      const { procesarCola } = await import("../../lib/queue-processor");
      const mockBatch = {
        messages: [{
          body: {
            type: "persona",
            data: validated
          },
          ack: () => {}
        }]
      };
      await procesarCola(mockBatch as any, env);
    } else {
      await env.CENSO_QUEUE.send({
        type: "persona",
        data: validated
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Registro encolado" }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar persona:", error);
    return new Response(JSON.stringify({ error: error.message || "Datos inválidos" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};
