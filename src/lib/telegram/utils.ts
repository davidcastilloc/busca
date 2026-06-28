import type { D1Database } from "@cloudflare/workers-types";

// Helper para calcular distancia
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

// Helper para generar el teclado de refugios y opción GPS
export async function getShelterKeyboard(db: D1Database): Promise<any> {
  try {
    const { results } = await db
      .prepare("SELECT nombre FROM refugios ORDER BY nombre ASC")
      .all<{ nombre: string }>();

    const keyboard: any[][] = [];
    if (results && results.length > 0) {
      // Agrupar en filas de 2 para mejor visualización
      for (let i = 0; i < results.length; i += 2) {
        const row = results.slice(i, i + 2).map((r) => ({ text: r.nombre }));
        keyboard.push(row);
      }
    }
    
    // Botón para compartir ubicación GPS real
    keyboard.push([{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }]);
    
    // Botón para cancelar
    keyboard.push([{ text: "/cancelar" }]);

    return {
      keyboard: keyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } catch (err) {
    console.error("Error al generar teclado de refugios:", err);
    return {
      keyboard: [
        [{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }],
        [{ text: "/cancelar" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
  }
}

// Helper para resolver la ubicación en texto, refugio_id y coords
export async function resolveLocation(
  db: D1Database,
  text: string | undefined,
  location: { latitude: number; longitude: number } | undefined
): Promise<{ ubicacion_nombre: string; latitud: number | null; longitud: number | null; refugio_id: number | null; valid: boolean }> {
  let ubicacion_nombre = "";
  let latitud: number | null = null;
  let longitud: number | null = null;
  let refugio_id: number | null = null;
  let valid = true;

  if (location) {
    latitud = location.latitude;
    longitud = location.longitude;
    
    // Buscar refugio más cercano para darle contexto
    try {
      const { results } = await db.prepare("SELECT id, nombre, latitud, longitud FROM refugios").all<{ id: number; nombre: string; latitud: number; longitud: number }>();
      let refugioCercano = null;
      let minDist = 0.15; // 150 metros
      
      if (results) {
        for (const r of results) {
          const d = getDistance(location.latitude, location.longitude, r.latitud, r.longitud);
          if (d < minDist) {
            minDist = d;
            refugioCercano = r.nombre;
            refugio_id = r.id;
          }
        }
      }
      
      if (refugioCercano) {
        ubicacion_nombre = `GPS cerca de: ${refugioCercano}`;
      } else {
        ubicacion_nombre = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
      }
    } catch (e) {
      ubicacion_nombre = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
    }
  } else if (text && text.trim().length >= 3) {
    // Intentar buscar si coincide exactamente con el nombre de un refugio
    try {
      const shelter = await db
        .prepare("SELECT id, nombre, latitud, longitud FROM refugios WHERE nombre = ?")
        .bind(text.trim())
        .first<{ id: number; nombre: string; latitud: number; longitud: number }>();

      if (shelter) {
        refugio_id = shelter.id;
        ubicacion_nombre = shelter.nombre;
        latitud = shelter.latitud;
        longitud = shelter.longitud;
      } else {
        ubicacion_nombre = text.trim();
      }
    } catch (e) {
      ubicacion_nombre = text.trim();
    }
  } else {
    valid = false;
  }

  return { ubicacion_nombre, latitud, longitud, refugio_id, valid };
}
