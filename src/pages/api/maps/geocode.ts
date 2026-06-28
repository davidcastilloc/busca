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
      let phone_international = "";
      let website = "";
      let google_maps_url = "";
      let inferredType = "refugio";
      let horario: string[] = [];
      let abierto_ahora: boolean | undefined;
      let accesible: boolean | undefined;
      let estado_operativo = "";
      let estado_label = "";
      let estado_geo = "";
      let municipio = "";

      // Si tenemos un place_id y la clave de la API, consultamos los detalles del lugar
      if (placeId && apiKey) {
        try {
          const fields = [
            "name", "formatted_phone_number", "international_phone_number",
            "types", "website", "business_status", "wheelchair_accessible_entrance",
            "opening_hours", "url", "address_component", "formatted_address"
          ].join(",");
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}&language=es`;
          const detailsResp = await fetch(detailsUrl);
          if (detailsResp.ok) {
            const detailsData = await detailsResp.json() as any;
            if (detailsData.status === "OK" && detailsData.result) {
              const res = detailsData.result;
              name = res.name || "";
              phone = res.formatted_phone_number || "";
              phone_international = res.international_phone_number || "";
              website = res.website || "";
              google_maps_url = res.url || "";

              if (res.types) {
                const types = res.types as string[];
                const esHospital = types.some((t: string) => ["hospital", "health", "doctor", "pharmacy", "medical_clinic", "dentist", "physiotherapist"].includes(t));
                if (esHospital) inferredType = "hospital";
                else {
                  const esAcopio = types.some((t: string) => ["warehouse", "storage", "supermarket", "grocery_or_supermarket"].includes(t));
                  if (esAcopio) inferredType = "centro_acopio";
                }
              }

              if (res.business_status) {
                estado_operativo = res.business_status;
                const statusMap: Record<string, string> = {
                  "OPERATIONAL": "Operativo",
                  "CLOSED_TEMPORARILY": "Cerrado temporalmente",
                  "CLOSED_PERMANENTLY": "Cerrado permanentemente"
                };
                estado_label = statusMap[res.business_status] || res.business_status;
              }

              if (res.wheelchair_accessible_entrance !== undefined) {
                accesible = res.wheelchair_accessible_entrance;
              }

              if (res.opening_hours) {
                horario = res.opening_hours.weekday_text || [];
                abierto_ahora = res.opening_hours.open_now;
              }

              if (res.address_components) {
                for (const comp of res.address_components) {
                  if (comp.types?.includes("administrative_area_level_1")) {
                    estado_geo = comp.long_name;
                  }
                  if (comp.types?.includes("administrative_area_level_2") || comp.types?.includes("locality")) {
                    municipio = comp.long_name;
                  }
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
        name,
        phone,
        phone_international: phone_international || undefined,
        website: website || undefined,
        google_maps_url: google_maps_url || undefined,
        tipo: inferredType,
        horario: horario.length > 0 ? horario : undefined,
        abierto_ahora,
        accesible,
        estado_operativo: estado_operativo || undefined,
        estado_label: estado_label || undefined,
        estado: estado_geo || undefined,
        municipio: municipio || undefined,
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
