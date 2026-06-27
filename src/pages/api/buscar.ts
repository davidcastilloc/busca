import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const { DB, CACHE_KV } = env;

    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";
    const tipo = url.searchParams.get("tipo")?.trim() || "personas";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

    if (!query) {
      return new Response(JSON.stringify({ results: [], hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cacheKey = `search:${tipo}:${query.toLowerCase()}:L${limit}:O${offset}`;
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
    let hasMorePersonas = false;
    let hasMoreReportes = false;

    if (tipo === "personas" || tipo === "todos") {
      const personasRes = await DB.prepare(`
        SELECT * FROM personas 
        WHERE cedula = ? 
           OR nombre LIKE ? 
           OR apellido LIKE ? 
           OR ubicacion_nombre LIKE ?
           OR refugio LIKE ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).bind(query, term, term, term, term, limit, offset).all();
      
      if (personasRes.results) {
        results.push(...personasRes.results.map((p: any) => ({ ...p, _source: "persona" })));
        if (personasRes.results.length === limit) {
          hasMorePersonas = true;
        }
      }
    }

    if (tipo === "reportes" || tipo === "todos") {
      const reportesRes = await DB.prepare(`
        SELECT * FROM reportes
        WHERE cedula_buscado = ?
           OR nombre_buscado LIKE ?
           OR ubicacion_nombre LIKE ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).bind(query, term, term, limit, offset).all();
      
      if (reportesRes.results) {
        results.push(...reportesRes.results.map((r: any) => ({ ...r, _source: "reporte" })));
        if (reportesRes.results.length === limit) {
          hasMoreReportes = true;
        }
      }
    }

    const hasMore = hasMorePersonas || hasMoreReportes;
    const responseBody = JSON.stringify({ results, hasMore });

    // Cachear en KV por 30 segundos (búsquedas dinámicas más cortas)
    await CACHE_KV.put(cacheKey, responseBody, { expirationTtl: 30 });

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
