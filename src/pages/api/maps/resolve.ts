import type { APIRoute } from "astro";

export const prerender = false;

function extraerDeUrl(urlStr: string): { lat: number; lng: number } | null {
  try {
    const decoded = decodeURIComponent(urlStr);
    
    // 1. Patrón @lat,lng
    let match = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    
    // 2. Patrón q=lat,lng o ll=lat,lng
    match = decoded.match(/[?&](q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[3]) };
    
    // 3. Patrón /place/lat,lng
    match = decoded.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    
  } catch {
    // silenciar
  }
  return null;
}

/**
 * Extraer coordenadas del HTML de Google Maps.
 * Prioridad:
 *   1. APP_INITIALIZATION_STATE → formato [[[altitud, lng, lat], ...]]
 *   2. Patrón !3d<lat>!4d<lng> (protocol buffer en URLs internas)
 *   3. center=lat,lng en og:image (fallback menos preciso)
 */
function extraerDeHtml(html: string): { lat: number; lng: number } | null {
  // 1. APP_INITIALIZATION_STATE — la fuente más fiable
  // Formato: window.APP_INITIALIZATION_STATE=[[[altitud,lng,lat],[0,0,0],...]]
  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[([^\]]+)\]/);
  if (appInit) {
    const parts = appInit[1].split(",");
    if (parts.length >= 3) {
      const lng = parseFloat(parts[1]);
      const lat = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }

  // 2. Patrón !3d<lat>!4d<lng> en URLs internas del HTML
  const pbMatch = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pbMatch) {
    return { lat: parseFloat(pbMatch[1]), lng: parseFloat(pbMatch[2]) };
  }

  // 3. center=lat,lng en staticmap URL (og:image) — fallback
  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (centerMatch) {
    return { lat: parseFloat(centerMatch[1]), lng: parseFloat(centerMatch[2]) };
  }

  return null;
}

export const POST: APIRoute = async (context) => {
  try {
    const { url } = await context.request.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL requerida" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // A. Intentar extraer de la URL directa (sin hacer peticiones)
    const coordenadasDirectas = extraerDeUrl(url);
    if (coordenadasDirectas) {
      return new Response(JSON.stringify({ success: true, ...coordenadasDirectas }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // B. Redirect manual para capturar el Location header (enlaces cortos goo.gl, maps.app.goo.gl)
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

        // Intentar extraer de la URL redireccionada
        const coordenadasRedir = extraerDeUrl(targetUrl);
        if (coordenadasRedir) {
          return new Response(JSON.stringify({ success: true, ...coordenadasRedir }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    // C. Fetch final con cookie de consentimiento + cache deshabilitado
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA",
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache"
      },
      // @ts-ignore — Propiedad de Cloudflare Workers para deshabilitar cache de edge
      cf: { cacheTtl: 0 }
    });

    const finalUrl = res.url;

    // Intentar extraer de la URL final resuelta
    const coordenadasFinalUrl = extraerDeUrl(finalUrl);
    if (coordenadasFinalUrl) {
      return new Response(JSON.stringify({ success: true, ...coordenadasFinalUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // D. Si redirigió a consent.google.com, extraer del parámetro "continue"
    if (finalUrl.includes("consent.google") || finalUrl.includes("google.com/consent")) {
      const urlObj = new URL(finalUrl);
      const continueUrl = urlObj.searchParams.get("continue");
      if (continueUrl) {
        const coordenadasContinue = extraerDeUrl(continueUrl);
        if (coordenadasContinue) {
          return new Response(JSON.stringify({ success: true, ...coordenadasContinue }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    // E. Parsear HTML con múltiples estrategias
    const html = await res.text();
    const coordenadasHtml = extraerDeHtml(html);
    if (coordenadasHtml) {
      return new Response(JSON.stringify({ success: true, ...coordenadasHtml }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "No se pudieron extraer coordenadas de este enlace. Prueba marcando en el mapa." }), {
      status: 422,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Error al resolver URL de Google Maps:", error);
    return new Response(JSON.stringify({ error: "Error al procesar el enlace. Asegúrate de que es una URL válida de Google Maps." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
