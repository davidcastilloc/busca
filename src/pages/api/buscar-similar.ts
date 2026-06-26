import type { APIRoute } from "astro";
import { generarEmbedding } from "../../lib/ai";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime.env;
    const { DB, VECTOR_INDEX } = env;
    const body = await context.request.json();
    const { descripcion } = body;

    if (!descripcion || typeof descripcion !== "string" || descripcion.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Descripción de búsqueda muy corta" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Generar embedding de consulta
    const queryVector = await generarEmbedding(env, descripcion);

    // 2. Buscar en Vectorize
    const vectorizeResults = await VECTOR_INDEX.query(queryVector, {
      topK: 10,
      returnMetadata: "all"
    });

    if (!vectorizeResults.matches || vectorizeResults.matches.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Extraer IDs y scores
    const matchesMap = new Map<number, number>();
    const ids: number[] = [];

    for (const match of vectorizeResults.matches) {
      const metadata = match.metadata as { reporte_id?: number };
      const id = metadata?.reporte_id || parseInt(match.id.replace("reporte-", ""), 10);
      if (id && !isNaN(id)) {
        matchesMap.set(id, match.score);
        ids.push(id);
      }
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. Buscar detalles de los reportes en D1
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await DB.prepare(`
      SELECT * FROM reportes WHERE id IN (${placeholders})
    `).bind(...ids).all();

    // Ordenar de mayor a menor coincidencia (score)
    const sortedResults = results
      .map((row: any) => ({
        ...row,
        score: matchesMap.get(row.id) || 0
      }))
      .sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify(sortedResults), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en búsqueda semántica:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
