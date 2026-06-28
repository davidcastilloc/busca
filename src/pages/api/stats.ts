import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const CACHE_KEY = "api:stats";
const CACHE_TTL = 60; // segundos

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const GET: APIRoute = async () => {
  try {
    const { DB, CACHE_KV } = env;

    // Intentar cache primero
    const cached = await CACHE_KV.get(CACHE_KEY);
    if (cached) {
      return new Response(cached, {
        headers: { ...CORS_HEADERS, "X-Cache": "HIT" },
      });
    }

    // Consultas en paralelo a D1
    const [personasCount, reportesCount, personasActivas, reportesActivos, personasLocalizadas, reportesResueltos] =
      await Promise.all([
        DB.prepare("SELECT COUNT(*) as c FROM personas").first<{ c: number }>(),
        DB.prepare("SELECT COUNT(*) as c FROM reportes").first<{ c: number }>(),
        DB.prepare("SELECT COUNT(*) as c FROM personas WHERE estado = 'desconocido'").first<{ c: number }>(),
        DB.prepare("SELECT COUNT(*) as c FROM reportes WHERE tipo = 'desaparecido' AND estado_reporte = 'abierto'").first<{ c: number }>(),
        DB.prepare("SELECT COUNT(*) as c FROM personas WHERE estado IN ('vivo', 'herido')").first<{ c: number }>(),
        DB.prepare("SELECT COUNT(*) as c FROM reportes WHERE estado_reporte = 'resuelto'").first<{ c: number }>(),
      ]);

    const stats = {
      total_registrados: (personasCount?.c || 0) + (reportesCount?.c || 0),
      reportes_activos: (personasActivas?.c || 0) + (reportesActivos?.c || 0),
      localizados: (personasLocalizadas?.c || 0) + (reportesResueltos?.c || 0),
    };

    const body = JSON.stringify(stats);

    // Cachear en KV
    await CACHE_KV.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL });

    return new Response(body, {
      headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("Error obteniendo estadísticas:", error);
    return new Response(
      JSON.stringify({ error: "Error interno al obtener estadísticas" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
