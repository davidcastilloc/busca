import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// GET: Retorna puntos con coordenadas para el mapa de calor
export const GET: APIRoute = async () => {
  try {
    const { DB } = env;

    // Consultar personas con coordenadas válidas
    const personas = await DB.prepare(`
      SELECT latitud, longitud, estado 
      FROM personas 
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    `).all<{ latitud: number; longitud: number; estado: string }>();

    // Consultar reportes con coordenadas válidas
    const reportes = await DB.prepare(`
      SELECT latitud, longitud, tipo
      FROM reportes 
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    `).all<{ latitud: number; longitud: number; tipo: string }>();

    // Ponderación por estado/tipo (más peso = más intensidad en heatmap)
    const pesos: Record<string, number> = {
      fallecido: 3,
      herido: 2,
      desconocido: 1.5,
      vivo: 1,
      desaparecido: 2.5,
      encontrado: 1,
      refugio: 0.8,
      necesidad: 2,
    };

    const puntos: [number, number, number][] = [];

    // Agregar personas
    for (const p of personas.results || []) {
      const peso = pesos[p.estado] || 1;
      puntos.push([p.latitud, p.longitud, peso]);
    }

    // Agregar reportes
    for (const r of reportes.results || []) {
      const peso = pesos[r.tipo] || 1;
      puntos.push([r.latitud, r.longitud, peso]);
    }

    return new Response(JSON.stringify({ puntos, total: puntos.length }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error: any) {
    console.error("Error al generar datos de heatmap:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
