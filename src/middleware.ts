import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const proto = context.request.headers.get("x-forwarded-proto");
  const host = url.host;

  // Forzar HTTPS en producción
  if ((url.protocol === "http:" || proto === "http") && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    const httpsUrl = new URL(context.request.url);
    httpsUrl.protocol = "https:";
    return Response.redirect(httpsUrl.toString(), 301);
  }

  // ═══════════════════════════════════════════════════════════
  // Protección de rutas /admin/* con Cloudflare Access
  // ═══════════════════════════════════════════════════════════
  if (url.pathname.startsWith("/admin/") || url.pathname === "/admin") {
    // Verificar header de Cloudflare Access JWT
    const accessJwt = context.request.headers.get("Cf-Access-Jwt-Assertion");
    
    // En producción, Cloudflare Access inyecta este header automáticamente
    // Si no existe Y estamos en producción, bloquear acceso
    if (!accessJwt && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      // Verificar si Cloudflare Access está configurado
      // Si el header no existe, podría ser que Access no está configurado aún
      // En ese caso, permitir pero loguear warning
      console.warn(`Acceso a ${url.pathname} sin Cloudflare Access JWT desde ${context.request.headers.get("cf-connecting-ip")}`);
      
      // Descomentar la siguiente línea cuando Cloudflare Access esté configurado:
      // return new Response("Acceso no autorizado. Se requiere autenticación de Cloudflare Access.", { status: 403 });
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
