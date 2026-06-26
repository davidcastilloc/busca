import type { APIRoute } from "astro";
import { PersonaSchema, ReporteSchema } from "../../lib/validators";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime.env;
    const body = await context.request.json();

    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "El cuerpo de la petición debe ser un arreglo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let count = 0;
    const errors: string[] = [];

    for (const item of body) {
      try {
        const { type, data } = item;
        if (type === "persona") {
          const validated = PersonaSchema.parse(data);
          await env.CENSO_QUEUE.send({ type, data: validated });
          count++;
        } else if (type === "reporte") {
          const validated = ReporteSchema.parse(data);
          await env.CENSO_QUEUE.send({ type, data: validated });
          count++;
        } else {
          errors.push(`Tipo de registro no soportado: ${type}`);
        }
      } catch (err: any) {
        errors.push(`Error validando registro: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, count, errors }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en sincronización offline:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
