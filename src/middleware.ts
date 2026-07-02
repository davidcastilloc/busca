import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const proto = context.request.headers.get("x-forwarded-proto");
  const host = url.host;



  // ═══════════════════════════════════════════════════════════
  // Protección de rutas /panel/* y /api/panel/* con Cloudflare Access
  // ═══════════════════════════════════════════════════════════
  if (
    url.pathname.startsWith("/panel/") || 
    url.pathname === "/panel" || 
    url.pathname.startsWith("/api/panel/") || 
    url.pathname === "/api/panel"
  ) {
    // Verificar header de Cloudflare Access JWT
    const accessJwt = context.request.headers.get("Cf-Access-Jwt-Assertion");
    
    // En producción, Cloudflare Access inyecta este header automáticamente
    // Si no existe Y estamos en producción, bloquear acceso
    if (!accessJwt && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      console.warn(`Acceso a ${url.pathname} sin Cloudflare Access JWT desde ${context.request.headers.get("cf-connecting-ip")}`);
      return new Response("Acceso no autorizado. Se requiere autenticación de Cloudflare Access.", { status: 403 });
    }

    // Proteger endpoints de push-send (POST) — requieren admin
    if (url.pathname === "/api/push-send" && context.request.method === "POST") {
      if (!accessJwt && !host.includes("localhost") && !host.includes("127.0.0.1")) {
        return new Response(
          JSON.stringify({ error: "Acceso no autorizado. Solo administradores pueden enviar alertas." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }




  // ═══════════════════════════════════════════════════════════
  // Rate limiting para rutas de API (Movido a Cloudflare WAF)
  // ═══════════════════════════════════════════════════════════

  return next();
});
