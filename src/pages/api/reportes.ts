import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ReporteSchema } from "../../lib/validators";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();

    const validated = ReporteSchema.parse(body);

    await env.CENSO_QUEUE.send({
      type: "reporte",
      data: validated
    });

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
