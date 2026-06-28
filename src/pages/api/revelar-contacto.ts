import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { DB, CACHE_KV } = env;
    
    // 1. Rate Limiting por IP utilizando KV
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";
    const kvKey = `ratelimit:revelar:${ip}`;
    const limit = 10; // Máximo 10 revelaciones
    const windowSeconds = 60; // Ventana de 1 minuto

    const cachedLimit = await CACHE_KV.get(kvKey);
    let limitData = { count: 0, resetAt: Date.now() + windowSeconds * 1000 };

    if (cachedLimit) {
      try {
        limitData = JSON.parse(cachedLimit);
      } catch (e) {
        // Fallback si el JSON está corrupto
      }
    }

    if (Date.now() > limitData.resetAt) {
      limitData.count = 1;
      limitData.resetAt = Date.now() + windowSeconds * 1000;
    } else {
      limitData.count += 1;
    }

    // Guardar en KV
    await CACHE_KV.put(kvKey, JSON.stringify(limitData), { expirationTtl: windowSeconds });

    if (limitData.count > limit) {
      return new Response(JSON.stringify({ success: false, error: "Límite de solicitudes de contacto excedido (máx. 10 por minuto). Intente de nuevo más tarde." }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Procesar solicitud
    const body = await request.json();
    const { tipo, id } = body as { tipo: "persona" | "reporte"; id: number };

    if (!id || !tipo || (tipo !== "persona" && tipo !== "reporte")) {
      return new Response(JSON.stringify({ success: false, error: "Parámetros inválidos." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let contacto: string | null = null;

    if (tipo === "persona") {
      const res = await DB.prepare("SELECT contacto FROM personas WHERE id = ?").bind(id).first<{ contacto: string }>();
      contacto = res?.contacto || null;
    } else {
      const res = await DB.prepare("SELECT reportante_contacto FROM reportes WHERE id = ?").bind(id).first<{ reportante_contacto: string }>();
      contacto = res?.reportante_contacto || null;
    }

    if (!contacto) {
      return new Response(JSON.stringify({ success: true, contacto: "Sin contacto registrado" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true, contacto }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al revelar contacto:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
