import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { url } = await context.request.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL requerida" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Seguir redirecciones de Google Maps usando cabeceras de consentimiento para evitar bloqueos
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
      }
    });

    let finalUrl = res.url;

    // 1. Intentar buscar patrón @lat,lng en la URL final
    let match = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) {
      // 2. Intentar buscar patrón q=lat,lng o ll=lat,lng
      match = finalUrl.match(/[?&](q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    }
    if (!match) {
      // 3. Intentar buscar patrón /place/lat+lng
      match = finalUrl.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    }

    // 4. Si redirige a una página de consentimiento de cookies, extraer del parámetro "continue"
    if (!match && (finalUrl.includes("consent.google") || finalUrl.includes("google.com/consent"))) {
      const urlObj = new URL(finalUrl);
      const continueUrl = urlObj.searchParams.get("continue");
      if (continueUrl) {
        const decoded = decodeURIComponent(continueUrl);
        match = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                decoded.match(/[?&](q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                decoded.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
      }
    }

    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      return new Response(JSON.stringify({ success: true, lat, lng }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. Buscar en el HTML de respuesta cualquier ocurrencia de "center=latitud,longitud"
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
