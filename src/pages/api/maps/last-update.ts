import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    // Ejecutar consultas en batch para evitar errores de UNION ALL / compound SELECT en D1
    const statements = [
      DB.prepare("SELECT MAX(updated_at) as val FROM refugios"),
      DB.prepare("SELECT MAX(updated_at) as val FROM centros_acopio"),
      DB.prepare("SELECT MAX(updated_at) as val FROM hospitales"),
      DB.prepare("SELECT MAX(updated_at) as val FROM necesidades"),
      DB.prepare("SELECT MAX(updated_at) as val FROM personas"),
      DB.prepare("SELECT MAX(created_at) as val FROM zonas_peligro")
    ];

    const results = await DB.batch<{ val: string }>(statements);
    
    // Obtener la fecha más alta en JS
    let maxDate = "";
    for (const res of results) {
      if (res.results && res.results[0]) {
        const val = res.results[0].val;
        if (val && val > maxDate) {
          maxDate = val;
        }
      }
    }

    const url = new URL(request.url);
    const since = url.searchParams.get("since");
    if (since && maxDate === since) {
      return new Response(null, { status: 204 });
    }

    return new Response(
      JSON.stringify({ success: true, last_update: maxDate }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
