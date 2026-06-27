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

    // Seguir redirecciones de Google Maps
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const finalUrl = res.url;

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

    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      return new Response(JSON.stringify({ success: true, lat, lng }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. Buscar en el HTML de respuesta (metatags de staticmap o center)
    const html = await res.text();
    const staticMapMatch = html.match(/staticmap\?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/);
    if (staticMapMatch) {
      const lat = parseFloat(staticMapMatch[1]);
      const lng = parseFloat(staticMapMatch[2]);
      return new Response(JSON.stringify({ success: true, lat, lng }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ogImageMatch = html.match(/meta\s+property="og:image"\s+content="[^"]*center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
    if (ogImageMatch) {
      const lat = parseFloat(ogImageMatch[1]);
      const lng = parseFloat(ogImageMatch[2]);
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
