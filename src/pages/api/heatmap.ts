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
             COALESCE(p.latitud, r.latitud, h.latitud, c.latitud) as latitud, 
             COALESCE(p.longitud, r.longitud, h.longitud, c.longitud) as longitud, 
             p.estado 
      FROM personas p
      LEFT JOIN refugios r ON p.refugio_id = r.id OR p.refugio = r.nombre
      LEFT JOIN hospitales h ON p.hospital_id = h.id
      LEFT JOIN centros_acopio c ON p.centro_acopio_id = c.id
      WHERE (p.latitud IS NOT NULL AND p.longitud IS NOT NULL)
         OR (p.refugio_id IS NOT NULL AND r.latitud IS NOT NULL AND r.longitud IS NOT NULL)
         OR (p.hospital_id IS NOT NULL AND h.latitud IS NOT NULL AND h.longitud IS NOT NULL)
         OR (p.centro_acopio_id IS NOT NULL AND c.latitud IS NOT NULL AND c.longitud IS NOT NULL)
         OR (p.refugio IS NOT NULL AND r.latitud IS NOT NULL AND r.longitud IS NOT NULL)
    `).all<{ id: number; nombre: string; apellido: string; latitud: number; longitud: number; estado: string }>();

    // Consultar reportes con coordenadas válidas (o heredadas del refugio asociado)
    const reportes = await DB.prepare(`
      SELECT r.id, r.nombre_buscado, r.descripcion,
             COALESCE(r.latitud, ref.latitud, hosp.latitud, acop.latitud) as latitud, 
             COALESCE(r.longitud, ref.longitud, hosp.longitud, acop.longitud) as longitud, 
             r.tipo, r.estado_reporte
      FROM reportes r
      LEFT JOIN refugios ref ON r.refugio_id = ref.id OR r.ubicacion_nombre = ref.nombre
      LEFT JOIN hospitales hosp ON r.hospital_id = hosp.id
      LEFT JOIN centros_acopio acop ON r.centro_acopio_id = acop.id
      WHERE (r.latitud IS NOT NULL AND r.longitud IS NOT NULL)
         OR (r.refugio_id IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
         OR (r.hospital_id IS NOT NULL AND hosp.latitud IS NOT NULL AND hosp.longitud IS NOT NULL)
         OR (r.centro_acopio_id IS NOT NULL AND acop.latitud IS NOT NULL AND acop.longitud IS NOT NULL)
         OR (r.ubicacion_nombre IS NOT NULL AND (ref.latitud IS NOT NULL OR hosp.latitud IS NOT NULL OR acop.latitud IS NOT NULL))
    `).all<{ id: number; nombre_buscado: string; descripcion: string; latitud: number; longitud: number; tipo: string; estado_reporte: string }>();

    // Consultar refugios/acopios/hospitales con coordenadas válidas
    const queryUnified = `
      SELECT id, nombre, latitud, longitud, capacidad_maxima, ocupacion_actual, necesidades, inventario, 'refugio' as tipo
      FROM refugios
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
      UNION ALL
      SELECT id, nombre, latitud, longitud, NULL as capacidad_maxima, NULL as ocupacion_actual, necesidades, inventario, 'centro_acopio' as tipo
      FROM centros_acopio
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
      UNION ALL
      SELECT id, nombre, latitud, longitud, NULL as capacidad_maxima, NULL as ocupacion_actual, necesidades, NULL as inventario, 'hospital' as tipo
      FROM hospitales
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    `;
    const refugios = await DB.prepare(queryUnified).all<{ id: number; nombre: string; latitud: number; longitud: number; capacidad_maxima: number | null; ocupacion_actual: number | null; necesidades: string; inventario?: string; tipo: string }>();

    // Consultar necesidades con coordenadas
    const necesidades = await DB.prepare(`
      SELECT n.id, n.categoria, n.gravedad, n.descripcion,
             COALESCE(n.latitud, ref.latitud, hosp.latitud, acop.latitud) as latitud,
             COALESCE(n.longitud, ref.longitud, hosp.longitud, acop.longitud) as longitud,
             n.estado
      FROM necesidades n
      LEFT JOIN refugios ref ON n.refugio_id = ref.id
      LEFT JOIN hospitales hosp ON n.hospital_id = hosp.id
      LEFT JOIN centros_acopio acop ON n.centro_acopio_id = acop.id
      WHERE (n.latitud IS NOT NULL AND n.longitud IS NOT NULL)
         OR (n.refugio_id IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
         OR (n.hospital_id IS NOT NULL AND hosp.latitud IS NOT NULL AND hosp.longitud IS NOT NULL)
         OR (n.centro_acopio_id IS NOT NULL AND acop.latitud IS NOT NULL AND acop.longitud IS NOT NULL)
    `).all<{ id: number; categoria: string; gravedad: string; descripcion: string; latitud: number; longitud: number; estado: string }>();

    // Ponderación por estado/tipo (más peso = más intensidad en heatmap)
    const pesos: Record<string, number> = {
      fallecido: 3,
      herido: 2,
      desconocido: 1.5,
      localizado: 1,
      desaparecido: 2.5,
      encontrado: 1,
      refugio: 0.8,
      centro_acopio: 0.8,
      hospital: 0.8,
      necesidad: 2,
      Alta: 3,
      Media: 2,
      Baja: 1,
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
        nombreMostrar = "Persona no identificada";
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

    // Agregar centros
    for (const rf of refugios.results || []) {
      let semaforo = "verde";
      if (rf.inventario) {
        try {
          const inv = typeof rf.inventario === 'string' ? JSON.parse(rf.inventario) : rf.inventario;
          const valores = Object.values(inv);
          if (valores.includes("Crítico")) semaforo = "rojo";
          else if (valores.includes("Alerta")) semaforo = "amarillo";
        } catch {}
      }
      
      let peso = pesos[rf.tipo] || 0.8;
      if (semaforo === "rojo") peso = 3.5;
      else if (semaforo === "amarillo") peso = 2.0;

      puntos.push({
        lat: rf.latitud,
        lon: rf.longitud,
        peso: peso,
        id: rf.id,
        nombre: rf.nombre,
        tipo: rf.tipo,
        capacidad_maxima: rf.capacidad_maxima,
        ocupacion_actual: rf.ocupacion_actual,
        necesidades: rf.necesidades,
        estado: semaforo === "rojo" ? "alerta_critica" : semaforo === "amarillo" ? "alerta_moderada" : "activo"
      });
    }

    // Agregar necesidades
    for (const n of necesidades.results || []) {
      let peso = pesos[n.gravedad] || 2;
      
      let nombreMostrar = "Necesidad: " + n.categoria;

      puntos.push({
        lat: n.latitud,
        lon: n.longitud,
        peso: peso,
        id: n.id,
        nombre: nombreMostrar,
        tipo: "necesidad",
        estado: n.estado,
        estado_reporte: n.estado, // reutilizando field para UI
        descripcion: n.descripcion,
        gravedad: n.gravedad
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
