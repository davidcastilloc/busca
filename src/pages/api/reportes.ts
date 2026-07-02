import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";
import { crearReporteUnificado } from "../../lib/reporte-service";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    const body = await context.request.json();

    let voluntario: any = null;
    const sessionToken = context.cookies.get("session_token")?.value;
    if (sessionToken) {
      voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    }

    const cfContext = context.locals.cfContext || context.locals.runtime?.ctx;
    const result = await crearReporteUnificado(DB, body, voluntario ? voluntario.id : null, env, cfContext);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.message, issues: result.issues }), {
        status: result.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id, message: result.message }), {
      status: result.status,
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
