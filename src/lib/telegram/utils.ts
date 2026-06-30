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
    const query = `
      SELECT nombre FROM (
        SELECT nombre FROM refugios
        UNION ALL
        SELECT nombre FROM hospitales
        UNION ALL
        SELECT nombre FROM centros_acopio
      ) ORDER BY nombre ASC
    `;
    const { results } = await db.prepare(query).all<{ nombre: string }>();

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

// Helper para resolver la ubicación en texto, refugio_id, hospital_id, centro_acopio_id y coords
export async function resolveLocation(
  db: D1Database,
  text: string | undefined,
  location: { latitude: number; longitude: number } | undefined
): Promise<{ 
  ubicacion_nombre: string; 
  latitud: number | null; 
  longitud: number | null; 
  refugio_id: number | null; 
  hospital_id: number | null; 
  centro_acopio_id: number | null; 
  valid: boolean 
}> {
  let ubicacion_nombre = "";
  let latitud: number | null = null;
  let longitud: number | null = null;
  let refugio_id: number | null = null;
  let hospital_id: number | null = null;
  let centro_acopio_id: number | null = null;
  let valid = true;

  if (location) {
    latitud = location.latitude;
    longitud = location.longitude;
    
    // Buscar refugio/hospital/acopio más cercano para darle contexto
    try {
      const query = `
        SELECT id, nombre, latitud, longitud, 'refugio' as tipo FROM refugios
        UNION ALL
        SELECT id, nombre, latitud, longitud, 'hospital' as tipo FROM hospitales
        UNION ALL
        SELECT id, nombre, latitud, longitud, 'centro_acopio' as tipo FROM centros_acopio
      `;
      const { results } = await db.prepare(query).all<{ id: number; nombre: string; latitud: number; longitud: number; tipo: string }>();
      let centroCercano = null;
      let minDist = 0.15; // 150 metros
      
      if (results) {
        for (const r of results) {
          const d = getDistance(location.latitude, location.longitude, r.latitud, r.longitud);
          if (d < minDist) {
            minDist = d;
            centroCercano = r.nombre;
            refugio_id = null;
            hospital_id = null;
            centro_acopio_id = null;
            if (r.tipo === "hospital") {
              hospital_id = r.id;
            } else if (r.tipo === "centro_acopio") {
              centro_acopio_id = r.id;
            } else {
              refugio_id = r.id;
            }
          }
        }
      }
      
      if (centroCercano) {
        ubicacion_nombre = `GPS cerca de: ${centroCercano}`;
      } else {
        ubicacion_nombre = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
      }
    } catch (e) {
      ubicacion_nombre = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
    }
  } else if (text && text.trim().length >= 3) {
    // Intentar buscar si coincide exactamente con el nombre de un refugio/hospital/acopio
    try {
      const query = `
        SELECT id, nombre, latitud, longitud, 'refugio' as tipo FROM refugios WHERE nombre = ?
        UNION ALL
        SELECT id, nombre, latitud, longitud, 'hospital' as tipo FROM hospitales WHERE nombre = ?
        UNION ALL
        SELECT id, nombre, latitud, longitud, 'centro_acopio' as tipo FROM centros_acopio WHERE nombre = ?
      `;
      const shelter = await db
        .prepare(query)
        .bind(text.trim(), text.trim(), text.trim())
        .first<{ id: number; nombre: string; latitud: number; longitud: number; tipo: string }>();

      if (shelter) {
        if (shelter.tipo === "hospital") {
          hospital_id = shelter.id;
        } else if (shelter.tipo === "centro_acopio") {
          centro_acopio_id = shelter.id;
        } else {
          refugio_id = shelter.id;
        }
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

  return { ubicacion_nombre, latitud, longitud, refugio_id, hospital_id, centro_acopio_id, valid };
}

// Validar initData de Telegram WebApp usando Web Crypto API
export async function verifyTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    params.delete("hash");

    // Ordenar alfabéticamente
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");

    const encoder = new TextEncoder();
    const secretKeyData = encoder.encode("WebAppData");
    
    const secretKey = await crypto.subtle.importKey(
      "raw",
      secretKeyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const botKeyData = encoder.encode(botToken);
    const botSignatureBuffer = await crypto.subtle.sign("HMAC", secretKey, botKeyData);

    const hmacKey = await crypto.subtle.importKey(
      "raw",
      botSignatureBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const dataCheckBuffer = encoder.encode(dataCheckString);
    const signatureBuffer = await crypto.subtle.sign("HMAC", hmacKey, dataCheckBuffer);

    // Convertir firma a hex
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const calculatedHash = signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return calculatedHash === hash;
  } catch (err) {
    console.error("Error al validar initData de Telegram:", err);
    return false;
  }
}

