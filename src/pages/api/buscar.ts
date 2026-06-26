import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime.env;
    const { DB, CACHE_KV } = env;

    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";

    if (!query) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const cacheKey = `search:${query.toLowerCase()}`;
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
    const { results } = await DB.prepare(`
      SELECT * FROM personas 
      WHERE cedula = ? 
         OR nombre LIKE ? 
         OR apellido LIKE ? 
         OR ubicacion_nombre LIKE ?
         OR refugio LIKE ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).bind(query, term, term, term, term).all();

    const responseBody = JSON.stringify(results);

    // Cachear en KV por 30 segundos
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
