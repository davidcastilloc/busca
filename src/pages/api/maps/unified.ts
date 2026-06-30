import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { CATEGORIAS_INVENTARIO } from "../../../lib/items";

export const prerender = false;

interface RefugioRaw {
  id: number;
  nombre: string;
  direccion: string | null;
  latitud: number;
  longitud: number;
  capacidad_maxima: number;
  ocupacion_actual: number;
  necesidades: string | null;
  contacto: string | null;
  tipo: string;
  encargado: string | null;
  inventario: string | null;
  fotos: string | null;
  en_camino: number;
}

interface NecesidadRaw {
  id: number;
  categoria: string;
  gravedad: string;
  descripcion: string;
  latitud: number | null;
  longitud: number | null;
  estado: string;
  refugio_id: number | null;
  reportante_nombre: string | null;
  reportante_contacto: string | null;
  en_camino: number;
}

interface PersonaRaw {
  id: number;
  nombre: string;
  apellido: string | null;
  latitud: number | null;
  longitud: number | null;
  estado: string;
  refugio: string | null;
  contacto: string | null;
  notas: string | null;
}

export const GET: APIRoute = async () => {
  try {
    const { DB } = env;

    // 1. Obtener refugios con contador de ayuda en camino
    const refugiosRes = await DB.prepare(`
      SELECT id, nombre, direccion, latitud, longitud, 
             capacidad_maxima, ocupacion_actual, necesidades, 
             contacto, tipo, encargado, inventario, fotos,
             COALESCE((SELECT SUM(voluntarios_count) FROM ayudas_en_camino WHERE refugio_id = refugios.id AND estatus = 'en_ruta'), 0) as en_camino
      FROM refugios
      WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    `).all<RefugioRaw>();

    const refugios = (refugiosRes.results || []).map((r) => {
      // Calcular semáforo de inventario
      let itemsCriticos: string[] = [];
      let itemsAlerta: string[] = [];
      if (r.inventario) {
        try {
          const inv = typeof r.inventario === "string" ? JSON.parse(r.inventario) : r.inventario;
          for (const [itemId, estado] of Object.entries(inv)) {
            const itemObj = CATEGORIAS_INVENTARIO.flatMap((c) => c.items).find((i) => i.id === itemId);
            if (itemObj) {
              if (estado === "Crítico") itemsCriticos.push(itemObj.nombre);
              else if (estado === "Alerta") itemsAlerta.push(itemObj.nombre);
            }
          }
        } catch {}
      }
      const semaforo = itemsCriticos.length > 0 ? "rojo" : itemsAlerta.length > 0 ? "amarillo" : "verde";
      
      let fotosArray: string[] = [];
      if (r.fotos) {
        try {
          fotosArray = typeof r.fotos === "string" ? JSON.parse(r.fotos) : r.fotos;
        } catch {}
      }

      return {
        id: r.id,
        nombre: r.nombre,
        direccion: r.direccion || "Sin dirección",
        lat: r.latitud,
        lng: r.longitud,
        tipo: r.tipo || "refugio",
        semaforo,
        ocupacion: r.ocupacion_actual || 0,
        capacidad: r.capacidad_maxima || 100,
        encargado: r.encargado || "",
        necesidades: r.necesidades || "",
        contacto: r.contacto || "",
        itemsCriticos,
        itemsAlerta,
        fotos: fotosArray,
        en_camino: r.en_camino || 0
      };
    });

    // 2. Obtener necesidades con coords o asociadas a refugios, incluyendo voluntarios en camino
    const necesidadesRes = await DB.prepare(`
      SELECT n.id, n.categoria, n.gravedad, n.descripcion,
             COALESCE(n.latitud, ref.latitud) as latitud,
             COALESCE(n.longitud, ref.longitud) as longitud,
             n.estado, n.refugio_id, n.reportante_nombre, n.reportante_contacto,
             COALESCE((SELECT SUM(voluntarios_count) FROM ayudas_en_camino WHERE necesidad_id = n.id AND estatus = 'en_ruta'), 0) as en_camino
      FROM necesidades n
      LEFT JOIN refugios ref ON n.refugio_id = ref.id
      WHERE (n.latitud IS NOT NULL AND n.longitud IS NOT NULL)
         OR (n.refugio_id IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
    `).all<NecesidadRaw>();

    const necesidades = (necesidadesRes.results || []).map((n) => ({
      id: n.id,
      categoria: n.categoria === "Migrado" ? "General" : n.categoria,
      gravedad: n.gravedad,
      descripcion: n.descripcion,
      lat: n.latitud,
      lng: n.longitud,
      estado: n.estado,
      refugio_id: n.refugio_id,
      reportante: n.reportante_nombre || "Anónimo",
      contacto: n.reportante_contacto || "",
      en_camino: n.en_camino || 0
    }));

    // 3. Obtener personas con coords o asociadas a refugios
    const personasRes = await DB.prepare(`
      SELECT p.id, p.nombre, p.apellido, 
             COALESCE(p.latitud, ref.latitud) as latitud, 
             COALESCE(p.longitud, ref.longitud) as longitud, 
             p.estado, p.refugio, p.contacto, p.notas
      FROM personas p
      LEFT JOIN refugios ref ON p.refugio = ref.nombre
      WHERE (p.latitud IS NOT NULL AND p.longitud IS NOT NULL)
         OR (p.refugio IS NOT NULL AND ref.latitud IS NOT NULL AND ref.longitud IS NOT NULL)
    `).all<PersonaRaw>();

    const personas = (personasRes.results || []).map((p) => ({
      id: p.id,
      nombre: `${p.nombre} ${p.apellido || ""}`.trim(),
      lat: p.latitud,
      lng: p.longitud,
      estado: p.estado || "desconocido",
      refugio: p.refugio || "",
      contacto: p.contacto || "",
      notas: p.notas || ""
    }));

    // 4. Obtener zonas de peligro activas
    const peligrosRes = await DB.prepare(`
      SELECT id, tipo_peligro, descripcion, latitud, longitud, created_at
      FROM zonas_peligro
      WHERE activo = 1 AND latitud IS NOT NULL AND longitud IS NOT NULL
    `).all<{ id: string; tipo_peligro: string; descripcion: string; latitud: number; longitud: number; created_at: number }>();

    const peligros = (peligrosRes.results || []).map((p) => ({
      id: p.id,
      tipo: p.tipo_peligro,
      descripcion: p.descripcion,
      lat: p.latitud,
      lng: p.longitud
    }));

    return new Response(
      JSON.stringify({
        success: true,
        refugios,
        necesidades,
        personas,
        peligros
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=5" // Reducido a 5s para mayor dinamismo
        }
      }
    );
  } catch (error: any) {
    console.error("Error al generar datos del mapa unificado:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
