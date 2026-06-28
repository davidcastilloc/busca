import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// GET: Retorna puntos con coordenadas para el mapa de calor
export const GET: APIRoute = async () => {
  try {
    const { DB } = env;

    // Consultar personas con coordenadas válidas
    const personas = await DB.prepare(`
      SELECT p.id, p.nombre, p.apellido, 
             COALESCE(p.latitud, ref.latitud) as latitud, 
             COALESCE(p.longitud, ref.longitud) as longitud, 
             p.estado 
      FROM personas p
      LEFT JOIN refugios ref ON p.refugio = ref.nombre
      WHERE (p.latitud IS NOT NULL AND p.longitud IS NOT NULL)
         OR (p.refugio IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
    `).all<{ id: number; nombre: string; apellido: string; latitud: number; longitud: number; estado: string }>();

    // Consultar reportes con coordenadas válidas (o heredadas del refugio asociado)
    const reportes = await DB.prepare(`
      SELECT r.id, r.nombre_buscado, r.descripcion,
             COALESCE(r.latitud, ref.latitud) as latitud, 
             COALESCE(r.longitud, ref.longitud) as longitud, 
             r.tipo, r.estado_reporte
      FROM reportes r
      LEFT JOIN refugios ref ON r.refugio_id = ref.id OR r.ubicacion_nombre = ref.nombre
      WHERE (r.latitud IS NOT NULL AND r.longitud IS NOT NULL)
         OR (r.refugio_id IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
         OR (r.ubicacion_nombre IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
    `).all<{ id: number; nombre_buscado: string; descripcion: string; latitud: number; longitud: number; tipo: string; estado_reporte: string }>();

    // Consultar refugios con coordenadas válidas
    const refugios = await DB.prepare(`
      SELECT id, nombre, latitud, longitud, capacidad_maxima, ocupacion_actual, necesidades
      FROM refugios
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    `).all<{ id: number; nombre: string; latitud: number; longitud: number; capacidad_maxima: number; ocupacion_actual: number; necesidades: string }>();

    // Ponderación por estado/tipo (más peso = más intensidad en heatmap)
    const pesos: Record<string, number> = {
      fallecido: 3,
      herido: 2,
      desconocido: 1.5,
      localizado: 1,
      desaparecido: 2.5,
      encontrado: 1,
      refugio: 0.8,
      necesidad: 2,
    };

    const puntos: any[] = [];

    // Agregar personas
    for (const p of personas.results || []) {
      const peso = pesos[p.estado] || 1;
      puntos.push({
        lat: p.latitud,
        lon: p.longitud,
        peso: peso,
        id: p.id,
        nombre: `${p.nombre} ${p.apellido || ""}`.trim(),
        tipo: "persona",
        estado: p.estado
      });
    }

    // Agregar reportes
    for (const r of reportes.results || []) {
      const peso = pesos[r.tipo] || 1;
      
      let nombreMostrar = r.nombre_buscado;
      if (!nombreMostrar) {
        if (r.tipo === 'necesidad') {
          // Extraemos el tipo de necesidad de la descripción o mostramos un extracto
          const desc = r.descripcion || "";
          const match = desc.match(/\[TIPO NECESIDAD: (.*?)\]/);
          if (match && match[1]) {
            nombreMostrar = "Necesidad: " + match[1];
          } else {
            nombreMostrar = desc.length > 30 ? desc.substring(0, 30) + "..." : (desc || "Necesidad Reportada");
          }
        } else {
          nombreMostrar = "Persona no identificada";
        }
      }

      puntos.push({
        lat: r.latitud,
        lon: r.longitud,
        peso: peso,
        id: r.id,
        nombre: nombreMostrar,
        tipo: "reporte",
        estado: r.tipo,
        estado_reporte: r.estado_reporte
      });
    }

    // Agregar refugios
    for (const rf of refugios.results || []) {
      const peso = pesos["refugio"] || 0.8;
      puntos.push({
        lat: rf.latitud,
        lon: rf.longitud,
        peso: peso,
        id: rf.id,
        nombre: rf.nombre,
        tipo: "refugio",
        capacidad_maxima: rf.capacidad_maxima,
        ocupacion_actual: rf.ocupacion_actual,
        necesidades: rf.necesidades,
        estado: "activo"
      });
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
