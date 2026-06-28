import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

/**
 * Extraer coordenadas de una URL de Google Maps.
 * Prioridad:
 *   1. !8m2!3d<lat>!4d<lng> — coordenadas EXACTAS del pin
 *   2. !3d<lat>!4d<lng> genérico
 *   3. @lat,lng — centro de la vista del mapa (aproximado)
 *   4. q=lat,lng o ll=lat,lng
 *   5. /place/lat,lng
 */
function extraerDeUrl(urlStr: string): { lat: number; lng: number; aproximado?: boolean } | null {
  try {
    const decoded = decodeURIComponent(urlStr);

    let match = decoded.match(/!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    match = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

    match = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), aproximado: true };

    match = decoded.match(/[?&](q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[3]) };

    match = decoded.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };

  } catch { /* silenciar */ }
  return null;
}

/**
 * Extraer coordenadas del HTML de Google Maps.
 */
function extraerDeHtml(html: string): { lat: number; lng: number; aproximado?: boolean } | null {
  const pinMatch = html.match(/!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pinMatch) {
    return { lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) };
  }

  const pbMatch = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pbMatch) {
    return { lat: parseFloat(pbMatch[1]), lng: parseFloat(pbMatch[2]) };
  }

  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[([^\]]+)\]/);
  if (appInit) {
    const parts = appInit[1].split(",");
    if (parts.length >= 3) {
      const lng = parseFloat(parts[1]);
      const lat = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng, aproximado: true };
      }
    }
  }

  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (centerMatch) {
    return { lat: parseFloat(centerMatch[1]), lng: parseFloat(centerMatch[2]), aproximado: true };
  }

  return null;
}

/**
 * Extraer la dirección del path /place/ de una URL de Google Maps.
 * Quita el Plus Code del inicio y devuelve queries para geocodificar.
 * Ejemplo: /place/G39G+7VP+Nombre+Lugar,+Calle+X,+Ciudad/data=...
 * Devuelve: ["Calle X, Ciudad, Venezuela", "Nombre Lugar, Calle X, Ciudad, Venezuela"]
 */
function extraerDireccionDeUrl(urlStr: string): string[] {
  try {
    const decoded = decodeURIComponent(urlStr).replace(/\+/g, " ");
    const placeMatch = decoded.match(/\/place\/([^/?]+)/);
    if (!placeMatch) return [];

    let raw = placeMatch[1].trim();

    // Quitar Plus Code del inicio (formato: XXXX+XX o XXXX XXX)
    raw = raw.replace(/^[23456789CFGHJMPQRVWX]{4,8}[+ ][23456789CFGHJMPQRVWX]{2,3}\s*/i, "").trim();

    if (!raw) return [];

    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return [];

    const queries: string[] = [];

    // 1. Solo la dirección (sin el nombre del lugar = primer segmento)
    if (parts.length >= 3) {
      queries.push(parts.slice(1).join(", ") + ", Venezuela");
    }

    // 2. Todo junto
    queries.push(parts.join(", ") + ", Venezuela");

    // 3. Si hay algo que parece calle/avenida + ciudad, probar solo eso
    const calles = parts.filter(p => /^(av|calle|carrera|urbanizaci|sector|barrio|parroquia|boulevard|blvd)/i.test(p));
    const ciudades = parts.filter(p => /\d{4}/.test(p) || /^(caracas|maracaibo|valencia|barquisimeto|maracay|mérida|maturín|barinas|guanare|ciudad|san|puerto|punto)/i.test(p));
    if (calles.length > 0 && ciudades.length > 0) {
      queries.unshift(calles.join(", ") + ", " + ciudades[0] + ", Venezuela");
    }

    return queries;
  } catch { /* silenciar */ }
  return [];
}

/**
 * Geocodificar una dirección usando Nominatim (OSM) — gratis, sin API key.
 */
async function geocodificarNominatim(queries: string[]): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=ve`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "dondeestan.org (proyecto humanitario voluntario)",
          "Accept-Language": "es"
        }
      });
      if (res.ok) {
        const data = await res.json() as Array<{ lat: string; lon: string }>;
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            return { lat, lng: lon };
          }
        }
      }
    } catch {
      // Continuar con el siguiente query
    }
  }
  return null;
}

/**
 * Geocodificar una dirección usando la API de Google Maps Geocoding.
 */
async function geocodificarGoogle(queries: string[], apiKey: string): Promise<{ lat: number; lng: number } | null> {
  for (const q of queries) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:VE&key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.status === "OK" && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          return { lat: loc.lat, lng: loc.lng };
        }
      }
    } catch {
      // Continuar
    }
  }
  return null;
}

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const POST: APIRoute = async (context) => {
  try {
    const { url } = await context.request.json();
    if (!url) {
      return jsonResp({ error: "URL requerida" }, 400);
    }

    const apiKey = (env as any).GOOGLE_MAPS_API_KEY;

    // A. Intentar extraer de la URL directa (sin hacer peticiones)
    const coordenadasDirectas = extraerDeUrl(url);
    if (coordenadasDirectas && !coordenadasDirectas.aproximado) {
      return jsonResp({ success: true, lat: coordenadasDirectas.lat, lng: coordenadasDirectas.lng });
    }

    // B. Redirect manual (enlaces cortos goo.gl, maps.app.goo.gl)
    let targetUrl = url;
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        targetUrl = location;

        // Intentar extraer coords exactas de la URL redireccionada
        const coordenadasRedir = extraerDeUrl(targetUrl);
        if (coordenadasRedir && !coordenadasRedir.aproximado) {
          return jsonResp({ success: true, lat: coordenadasRedir.lat, lng: coordenadasRedir.lng });
        }

        // C. Si la URL tiene dirección pero no coords exactas, geocodificar
        const queries = extraerDireccionDeUrl(targetUrl);
        if (queries.length > 0) {
          const geocoded = apiKey
            ? await geocodificarGoogle(queries, apiKey)
            : await geocodificarNominatim(queries);
          if (geocoded) {
            return jsonResp({ success: true, lat: geocoded.lat, lng: geocoded.lng });
          }
        }
      }
    }

    // D. Fetch final con cookie de consentimiento
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA",
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache"
      },
      // @ts-ignore — Cloudflare Workers: deshabilitar cache de edge
      cf: { cacheTtl: 0 }
    });

    const finalUrl = res.url;

    // Extraer de la URL final
    const coordenadasFinalUrl = extraerDeUrl(finalUrl);
    if (coordenadasFinalUrl && !coordenadasFinalUrl.aproximado) {
      return jsonResp({ success: true, lat: coordenadasFinalUrl.lat, lng: coordenadasFinalUrl.lng });
    }

    // E. consent.google.com → extraer del parámetro "continue"
    if (finalUrl.includes("consent.google") || finalUrl.includes("google.com/consent")) {
      const urlObj = new URL(finalUrl);
      const continueUrl = urlObj.searchParams.get("continue");
      if (continueUrl) {
        const coordenadasContinue = extraerDeUrl(continueUrl);
        if (coordenadasContinue) {
          return jsonResp({
            success: true,
            lat: coordenadasContinue.lat,
            lng: coordenadasContinue.lng,
            aproximado: coordenadasContinue.aproximado || false
          });
        }
      }
    }

    // F. Parsear HTML
    const html = await res.text();
    const coordenadasHtml = extraerDeHtml(html);
    if (coordenadasHtml && !coordenadasHtml.aproximado) {
      return jsonResp({ success: true, lat: coordenadasHtml.lat, lng: coordenadasHtml.lng });
    }

    // G. Si solo tenemos coords aproximadas, intentar geocodificar dirección de la URL original o targetUrl
    const urlsParaDireccion = [targetUrl, url, finalUrl];
    for (const u of urlsParaDireccion) {
      const queries = extraerDireccionDeUrl(u);
      if (queries.length > 0) {
        const geocoded = apiKey
          ? await geocodificarGoogle(queries, apiKey)
          : await geocodificarNominatim(queries);
        if (geocoded) {
          return jsonResp({ success: true, lat: geocoded.lat, lng: geocoded.lng });
        }
        break; // Ya intentamos, no repetir
      }
    }

    // H. Último recurso: coordenadas aproximadas
    const aproxCoords = coordenadasHtml || coordenadasDirectas || coordenadasFinalUrl;
    if (aproxCoords) {
      return jsonResp({
        success: true,
        lat: aproxCoords.lat,
        lng: aproxCoords.lng,
        aproximado: true
      });
    }

    return jsonResp({ error: "No se pudieron extraer coordenadas de este enlace. Prueba marcando en el mapa." }, 422);

  } catch (error: any) {
    console.error("Error al resolver URL de Google Maps:", error);
    return jsonResp({ error: "Error al procesar el enlace. Asegúrate de que es una URL válida de Google Maps." }, 500);
  }
};
