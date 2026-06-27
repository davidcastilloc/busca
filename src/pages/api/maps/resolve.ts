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
    
    // 3. Patrón /place/lat+lng o /place/lat,lng
    match = decoded.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    
  } catch (e) {
    console.error("Error al parsear URL en extractor:", e);
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

    // A. Intentar extraer de la URL inicial (sin hacer peticiones)
    const coordenadasDirectas = extraerDeUrl(url);
    if (coordenadasDirectas) {
      return new Response(JSON.stringify({ success: true, ...coordenadasDirectas }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // B. Si no, hacer fetch con redirección manual para capturar saltos de dominio
    let targetUrl = url;
    let response = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    // Si es redirección (3xx), seguirla manualmente
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        targetUrl = location;
        
        // Intentar extraer de la nueva URL redireccionada
        const coordenadasRedir = extraerDeUrl(targetUrl);
        if (coordenadasRedir) {
          return new Response(JSON.stringify({ success: true, ...coordenadasRedir }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    // C. Hacer fetch a la URL final, inyectando la cookie de consentimiento de Google para evitar el muro de cookies
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
      }
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

    // D. Si redirigió a una página de cookies (consent.google.com), intentar extraer del parámetro "continue"
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

    // E. Buscar en el HTML de la respuesta final por center=lat,lng (típico en og:image y metatags de Google Maps)
    const html = await res.text();
    const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
    if (centerMatch) {
      const lat = parseFloat(centerMatch[1]);
      const lng = parseFloat(centerMatch[2]);
      return new Response(JSON.stringify({ success: true, lat, lng }), {
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
