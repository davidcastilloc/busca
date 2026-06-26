import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // Solo aplicar rate limit a rutas de API, excluyendo la visualización de fotos (GET /api/upload)
  if (url.pathname.startsWith("/api/") && !(url.pathname === "/api/upload" && context.request.method === "GET")) {
    try {
      const env = context.locals.runtime.env;
      const { CACHE_KV } = env;

      if (CACHE_KV) {
        const ip = context.request.headers.get("cf-connecting-ip") || "127.0.0.1";
        const minute = Math.floor(Date.now() / 60000);
        const limitKey = `rl:${ip}:${minute}`;

        const current = await CACHE_KV.get(limitKey);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= 60) {
          return new Response(
            JSON.stringify({ error: "Límite de solicitudes excedido (máx 60/min). Intente más tarde." }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "60"
              }
            }
          );
        }

        // Incrementar contador con expiración de 60 segundos
        await CACHE_KV.put(limitKey, (count + 1).toString(), {
          expirationTtl: 60
        });
      }
    } catch (error) {
      console.error("Error en middleware de rate limit:", error);
      // Permitir continuar si falla el rate limiter para no bloquear el servicio en emergencias
    }
  }

  return next();
});
