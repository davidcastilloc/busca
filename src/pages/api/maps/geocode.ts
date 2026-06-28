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
      const firstResult = data.results[0];
      const location = firstResult.geometry.location;
      const placeId = firstResult.place_id;

      let name = "";
      let phone = "";
      let website = "";
      let inferredType = "refugio";

      // Si tenemos un place_id y la clave de la API, consultamos los detalles del lugar
      if (placeId && apiKey) {
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,types,website&key=${apiKey}&language=es`;
          const detailsResp = await fetch(detailsUrl);
          if (detailsResp.ok) {
            const detailsData = await detailsResp.json() as any;
            if (detailsData.status === "OK" && detailsData.result) {
              const res = detailsData.result;
              name = res.name || "";
              phone = res.formatted_phone_number || "";
              website = res.website || "";
              if (res.types) {
                const types = res.types as string[];
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
          console.error("Error consultando Place Details:", err);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        lat: location.lat,
        lng: location.lng,
        formatted_address: firstResult.formatted_address,
        name: name,
        phone: phone,
        website: website,
        tipo: inferredType
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
