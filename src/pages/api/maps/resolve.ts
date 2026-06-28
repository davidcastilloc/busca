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
 * Geocodificar una dirección usando la API de Google Maps Geocoding y Place Details.
 */
async function geocodificarGoogle(
  queries: string[], 
  apiKey: string
): Promise<{ lat: number; lng: number; name?: string; phone?: string; tipo?: string; formatted_address?: string } | null> {
  for (const q of queries) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:VE&key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.status === "OK" && data.results && data.results.length > 0) {
          const firstResult = data.results[0];
          const loc = firstResult.geometry.location;
          
          let name = "";
          let phone = "";
          let inferredType = "refugio";
          
          if (firstResult.place_id) {
            try {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${firstResult.place_id}&fields=name,formatted_phone_number,types&key=${apiKey}&language=es`;
              const detailsResp = await fetch(detailsUrl);
              if (detailsResp.ok) {
                const detailsData = await detailsResp.json() as any;
                if (detailsData.status === "OK" && detailsData.result) {
                  name = detailsData.result.name || "";
                  phone = detailsData.result.formatted_phone_number || "";
                  if (detailsData.result.types) {
                    const types = detailsData.result.types as string[];
                    const esHospital = types.some(t => ["hospital", "health", "doctor", "pharmacy", "medical_clinic"].includes(t));
                    if (esHospital) inferredType = "hospital";
                    else {
                      const esAcopio = types.some(t => ["warehouse", "storage", "supermarket", "grocery_or_supermarket"].includes(t));
                      if (esAcopio) inferredType = "centro_acopio";
                    }
                  }
                }
              }
            } catch (err) {
              console.error("Error en Place Details de resolve:", err);
            }
          }

          return { 
            lat: loc.lat, 
            lng: loc.lng,
            name: name || firstResult.formatted_address.split(",")[0],
            formatted_address: firstResult.formatted_address,
            phone,
            tipo: inferredType
          };
        }
      }
    } catch {
      // Continuar
    }
  }
  return null;
}

/**
 * Enriquecer coordenadas usando Reverse Geocoding y Place Details.
 */
async function enriquecerCoordenadas(
  lat: number, 
  lng: number, 
  apiKey: string
): Promise<{ name?: string; phone?: string; tipo?: string; formatted_address?: string } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as any;
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const firstResult = data.results[0];
        let name = "";
        let phone = "";
        let inferredType = "refugio";
        
        if (firstResult.place_id) {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${firstResult.place_id}&fields=name,formatted_phone_number,types&key=${apiKey}&language=es`;
          const detailsResp = await fetch(detailsUrl);
          if (detailsResp.ok) {
            const detailsData = await detailsResp.json() as any;
            if (detailsData.status === "OK" && detailsData.result) {
              name = detailsData.result.name || "";
              phone = detailsData.result.formatted_phone_number || "";
              if (detailsData.result.types) {
                const types = detailsData.result.types as string[];
                const esHospital = types.some(t => ["hospital", "health", "doctor", "pharmacy", "medical_clinic"].includes(t));
                if (esHospital) inferredType = "hospital";
                else {
                  const esAcopio = types.some(t => ["warehouse", "storage", "supermarket", "grocery_or_supermarket"].includes(t));
                  if (esAcopio) inferredType = "centro_acopio";
                }
              }
            }
          }
        }
        return {
          name: name || firstResult.formatted_address.split(",")[0],
          formatted_address: firstResult.formatted_address,
          phone,
          tipo: inferredType
        };
      }
    }
  } catch (err) {
    console.error("Error en enriquecerCoordenadas:", err);
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

    let lat: number | null = null;
    let lng: number | null = null;
    let aproximado = false;
    let name = "";
    let formatted_address = "";
    let phone = "";
    let tipo = "refugio";

    // A. Intentar extraer de la URL directa (sin hacer peticiones)
    const coordenadasDirectas = extraerDeUrl(url);
    if (coordenadasDirectas && !coordenadasDirectas.aproximado) {
      lat = coordenadasDirectas.lat;
      lng = coordenadasDirectas.lng;
    }

    // B. Redirect manual (enlaces cortos goo.gl, maps.app.goo.gl)
    let targetUrl = url;
    if (lat === null) {
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
            lat = coordenadasRedir.lat;
            lng = coordenadasRedir.lng;
          }

          // C. Si la URL tiene dirección pero no coords exactas, geocodificar
          if (lat === null) {
            const queries = extraerDireccionDeUrl(targetUrl);
            if (queries.length > 0) {
              const geocoded = apiKey
                ? await geocodificarGoogle(queries, apiKey)
                : await geocodificarNominatim(queries);
              if (geocoded) {
                lat = geocoded.lat;
                lng = geocoded.lng;
                if ('name' in geocoded && geocoded.name) {
                  name = geocoded.name;
                  formatted_address = geocoded.formatted_address || "";
                  phone = geocoded.phone || "";
                  tipo = geocoded.tipo || "refugio";
                }
              }
            }
          }
        }
      }
    }

    // D. Fetch final con cookie de consentimiento
    if (lat === null) {
      const res = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA",
          "Cache-Control": "no-cache, no-store",
          "Pragma": "no-cache"
        },
        // @ts-ignore
        cf: { cacheTtl: 0 }
      });

      const finalUrl = res.url;

      // Extraer de la URL final
      const coordenadasFinalUrl = extraerDeUrl(finalUrl);
      if (coordenadasFinalUrl && !coordenadasFinalUrl.aproximado) {
        lat = coordenadasFinalUrl.lat;
        lng = coordenadasFinalUrl.lng;
      }

      // E. consent.google.com → extraer del parámetro "continue"
      if (lat === null && (finalUrl.includes("consent.google") || finalUrl.includes("google.com/consent"))) {
        const urlObj = new URL(finalUrl);
        const continueUrl = urlObj.searchParams.get("continue");
        if (continueUrl) {
          const coordenadasContinue = extraerDeUrl(continueUrl);
          if (coordenadasContinue) {
            lat = coordenadasContinue.lat;
            lng = coordenadasContinue.lng;
            aproximado = coordenadasContinue.aproximado || false;
          }
        }
      }

      // F. Parsear HTML
      if (lat === null) {
        const html = await res.text();
        const coordenadasHtml = extraerDeHtml(html);
        if (coordenadasHtml && !coordenadasHtml.aproximado) {
          lat = coordenadasHtml.lat;
          lng = coordenadasHtml.lng;
        }

        // G. Si solo tenemos coords aproximadas, intentar geocodificar dirección de la URL original o targetUrl
        if (lat === null) {
          const urlsParaDireccion = [targetUrl, url, finalUrl];
          for (const u of urlsParaDireccion) {
            const queries = extraerDireccionDeUrl(u);
            if (queries.length > 0) {
              const geocoded = apiKey
                ? await geocodificarGoogle(queries, apiKey)
                : await geocodificarNominatim(queries);
              if (geocoded) {
                lat = geocoded.lat;
                lng = geocoded.lng;
                if ('name' in geocoded && geocoded.name) {
                  name = geocoded.name;
                  formatted_address = geocoded.formatted_address || "";
                  phone = geocoded.phone || "";
                  tipo = geocoded.tipo || "refugio";
                }
              }
              break;
            }
          }
        }

        // H. Último recurso: coordenadas aproximadas del HTML o URL
        if (lat === null) {
          const aproxCoords = coordenadasHtml || coordenadasDirectas || coordenadasFinalUrl;
          if (aproxCoords) {
            lat = aproxCoords.lat;
            lng = aproxCoords.lng;
            aproximado = true;
          }
        }
      }
    }

    // Enriquecer la respuesta si obtuvimos coordenadas pero faltan metadatos (como nombre/teléfono)
    if (lat !== null && lng !== null && apiKey && !name) {
      const enrichment = await enriquecerCoordenadas(lat, lng, apiKey);
      if (enrichment) {
        name = enrichment.name || "";
        formatted_address = enrichment.formatted_address || "";
        phone = enrichment.phone || "";
        tipo = enrichment.tipo || "refugio";
      }
    }

    if (lat !== null && lng !== null) {
      return jsonResp({
        success: true,
        lat,
        lng,
        aproximado,
        name: name || undefined,
        formatted_address: formatted_address || undefined,
        phone: phone || undefined,
        tipo: tipo || undefined
      });
    }

    return jsonResp({ error: "No se pudieron extraer coordenadas de este enlace. Prueba marcando en el mapa." }, 422);

  } catch (error: any) {
    console.error("Error al resolver URL de Google Maps:", error);
    return jsonResp({ error: "Error al procesar el enlace. Asegúrate de que es una URL válida de Google Maps." }, 500);
  }
};
