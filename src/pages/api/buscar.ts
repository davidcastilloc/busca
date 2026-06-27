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

    const tokens = query.split(/\s+/).filter(t => t.length > 0);
    const isNumeric = /^\d+$/.test(query);

    const results: any[] = [];
    let hasMorePersonas = false;
    let hasMoreReportes = false;

    if (tipo === "personas" || tipo === "todos") {
      let queryStr = "SELECT * FROM personas";
      const params: any[] = [];

      if (isNumeric) {
        queryStr += " WHERE cedula = ?";
        params.push(query);
      } else if (tokens.length > 0) {
        queryStr += " WHERE " + tokens.map(token => {
          const t = `%${token}%`;
          params.push(t, t, t, t);
          return "(nombre LIKE ? OR apellido LIKE ? OR ubicacion_nombre LIKE ? OR refugio LIKE ?)";
        }).join(" AND ");
      }

      queryStr += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const personasRes = await DB.prepare(queryStr).bind(...params).all();
      
      if (personasRes.results) {
        results.push(...personasRes.results.map((p: any) => ({ ...p, _source: "persona" })));
        if (personasRes.results.length === limit) {
          hasMorePersonas = true;
        }
      }
    }

    if (tipo === "reportes" || tipo === "todos") {
      let queryStr = "SELECT * FROM reportes";
      const params: any[] = [];

      if (isNumeric) {
        queryStr += " WHERE cedula_buscado = ?";
        params.push(query);
      } else if (tokens.length > 0) {
        queryStr += " WHERE " + tokens.map(token => {
          const t = `%${token}%`;
          params.push(t, t);
          return "(nombre_buscado LIKE ? OR ubicacion_nombre LIKE ?)";
        }).join(" AND ");
      }

      queryStr += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const reportesRes = await DB.prepare(queryStr).bind(...params).all();
      
      if (reportesRes.results) {
        results.push(...reportesRes.results.map((r: any) => ({ ...r, _source: "reporte" })));
        if (reportesRes.results.length === limit) {
          hasMoreReportes = true;
        }
      }
    }

    const hasMore = hasMorePersonas || hasMoreReportes;
    const responseBody = JSON.stringify({ results, hasMore });

    // Cachear en KV por 60 segundos (mínimo requerido por Cloudflare KV)
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
