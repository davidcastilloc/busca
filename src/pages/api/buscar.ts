import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const { DB, CACHE_KV } = env;

    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";
    const tipo = url.searchParams.get("tipo")?.trim() || "personas";

    if (!query) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cacheKey = `search:${tipo}:${query.toLowerCase()}`;
    const cached = await CACHE_KV.get(cacheKey);

    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT"
        }
      });
    }

    const term = `%${query}%`;
    const results: any[] = [];

    if (tipo === "personas" || tipo === "todos") {
      const personasRes = await DB.prepare(`
        SELECT * FROM personas 
        WHERE cedula = ? 
           OR nombre LIKE ? 
           OR apellido LIKE ? 
           OR ubicacion_nombre LIKE ?
           OR refugio LIKE ?
        ORDER BY updated_at DESC
        LIMIT 50
      `).bind(query, term, term, term, term).all();
      
      if (personasRes.results) {
        results.push(...personasRes.results.map((p: any) => ({ ...p, _source: "persona" })));
      }
    }

    if (tipo === "reportes" || tipo === "todos") {
      const reportesRes = await DB.prepare(`
        SELECT * FROM reportes
        WHERE cedula_buscado = ?
           OR nombre_buscado LIKE ?
           OR ubicacion_nombre LIKE ?
        ORDER BY updated_at DESC
        LIMIT 50
      `).bind(query, term, term).all();
      
      if (reportesRes.results) {
        results.push(...reportesRes.results.map((r: any) => ({ ...r, _source: "reporte" })));
      }
    }

    const responseBody = JSON.stringify(results);

    // Cachear en KV por 60 segundos
    await CACHE_KV.put(cacheKey, responseBody, { expirationTtl: 60 });

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS"
      }
    });
  } catch (error: any) {
    console.error("Error en búsqueda D1:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
