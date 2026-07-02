import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { PersonaSchema, ReporteSchema } from "../../lib/validators";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const sessionToken = context.cookies.get("session_token")?.value;
    
    // Obtener voluntario de la sesión si existe (los reportes son públicos, pero registrar personas requiere voluntario)
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);

    const body = await context.request.json();

    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "El cuerpo de la petición debe ser un arreglo" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let count = 0;
    const errors: string[] = [];

    const { upsertPersona } = await import("../../lib/db");
    const { crearReporteUnificado } = await import("../../lib/reporte-service");

    for (const item of body) {
      try {
        const { type, data } = item;
        if (type === "persona") {
          if (!voluntario) {
            errors.push("No autorizado para registrar personas en el censo offline.");
            continue;
          }
          const validated = PersonaSchema.parse(data);
          validated.created_by = voluntario.id;
          await upsertPersona(DB, validated);
          count++;
        } else if (type === "reporte" || type === "necesidad") {
          const payload = { 
            ...data, 
            tipo: type === "necesidad" ? "necesidad" : (data.tipo || "refugio") 
          };
          const cfContext = context.locals.cfContext || context.locals.runtime?.ctx;
          const result = await crearReporteUnificado(
            DB, 
            payload, 
            voluntario ? voluntario.id : null, 
            env, 
            cfContext
          );
          if (result.success) {
            count++;
          } else {
            errors.push(`Error sincronizando ${type}: ${result.message}`);
          }
        } else {
          errors.push(`Tipo de registro no soportado: ${type}`);
        }
      } catch (err: any) {
        errors.push(`Error validando/guardando registro: ${err.message}`);
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
