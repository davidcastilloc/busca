import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    // Consultar el timestamp más reciente de modificación de todas las tablas clave
    const result = await DB.prepare(`
      SELECT MAX(val) as last_update FROM (
        SELECT MAX(updated_at) as val FROM refugios
        UNION ALL
        SELECT MAX(updated_at) as val FROM centros_acopio
        UNION ALL
        SELECT MAX(updated_at) as val FROM hospitales
        UNION ALL
        SELECT MAX(updated_at) as val FROM necesidades
        UNION ALL
        SELECT MAX(updated_at) as val FROM personas
        UNION ALL
        SELECT MAX(created_at) as val FROM zonas_peligro
      )
    `).first<{ last_update: string }>();

    return new Response(
      JSON.stringify({ success: true, last_update: result?.last_update || "" }),
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
