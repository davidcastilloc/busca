import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const address = context.url.searchParams.get("address");
    if (!address) {
      return new Response(JSON.stringify({ error: "Dirección requerida" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiKey = (env as any).GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Google Maps API Key no configurada" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Consultar Google Geocoding API
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:VE&key=${apiKey}`;
    const resp = await fetch(geocodeUrl);
    
    if (!resp.ok) {
      throw new Error(`Error en Google Geocoding API: ${resp.status}`);
    }

    const data = await resp.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return new Response(JSON.stringify({
        success: true,
        lat: location.lat,
        lng: location.lng,
        formatted_address: data.results[0].formatted_address
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: `No se encontraron coordenadas para esta dirección. Status: ${data.status}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en geocode proxy:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
