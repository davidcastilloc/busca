import type { APIRoute } from "astro";
import { PersonaSchema } from "../../lib/validators";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime.env;
    const body = await context.request.json();

    const validated = PersonaSchema.parse(body);

    await env.CENSO_QUEUE.send({
      type: "persona",
      data: validated
    });

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
