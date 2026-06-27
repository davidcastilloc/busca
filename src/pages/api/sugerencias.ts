import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ sugerencias: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const tokens = query.split(/\s+/).filter(t => t.length > 0);
    const isNumeric = /^\d+$/.test(query);

    const sugerencias: any[] = [];

    // Buscar en personas
    let queryPersonas = "SELECT id, nombre, apellido, estado, cedula FROM personas";
    const paramsPersonas: any[] = [];
    if (isNumeric) {
      queryPersonas += " WHERE cedula LIKE ?";
      paramsPersonas.push(`%${query}%`);
    } else if (tokens.length > 0) {
      queryPersonas += " WHERE " + tokens.map(token => {
        const t = `%${token}%`;
        paramsPersonas.push(t, t);
        return "(nombre LIKE ? OR apellido LIKE ?)";
      }).join(" AND ");
    }
    queryPersonas += " LIMIT 5";

    const personasRes = await DB.prepare(queryPersonas).bind(...paramsPersonas).all();
    if (personasRes.results) {
      sugerencias.push(...personasRes.results.map((p: any) => ({
        id: p.id,
        nombre: `${p.nombre} ${p.apellido || ""}`.trim(),
        tipo: "persona",
        estado: p.estado,
        cedula: p.cedula
      })));
    }

    // Buscar en reportes
    let queryReportes = "SELECT id, nombre_buscado, tipo, estado_reporte, cedula_buscado FROM reportes";
    const paramsReportes: any[] = [];
    if (isNumeric) {
      queryReportes += " WHERE cedula_buscado LIKE ?";
      paramsReportes.push(`%${query}%`);
    } else if (tokens.length > 0) {
      queryReportes += " WHERE " + tokens.map(token => {
        paramsReportes.push(`%${token}%`);
        return "nombre_buscado LIKE ?";
      }).join(" AND ");
    }
    queryReportes += " LIMIT 5";

    const reportesRes = await DB.prepare(queryReportes).bind(...paramsReportes).all();
    if (reportesRes.results) {
      sugerencias.push(...reportesRes.results.map((r: any) => ({
        id: r.id,
        nombre: r.nombre_buscado || "Persona no identificada",
        tipo: "reporte",
        estado: r.tipo, // 'desaparecido' o 'encontrado'
        estado_reporte: r.estado_reporte, // 'abierto' o 'resuelto'
        cedula: r.cedula_buscado
      })));
    }

    // Limitar total a 5 elementos mezclados
    const totalSugerencias = sugerencias.slice(0, 5);

    return new Response(JSON.stringify({ sugerencias: totalSugerencias }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=15"
      }
    });
  } catch (error: any) {
    console.error("Error en sugerencias:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
