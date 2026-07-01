import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// GET: Retorna la clave pública VAPID para que el cliente la use al suscribirse
export const GET: APIRoute = async () => {
  try {
    const publicKey = env.VAPID_PUBLIC_KEY;

    if (!publicKey) {
      return new Response(
        JSON.stringify({ error: "VAPID_PUBLIC_KEY no configurada en el servidor" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ publicKey }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("Error al obtener VAPID key:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
