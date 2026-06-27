import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const token = context.cookies.get("session_token")?.value;

    if (token && DB) {
      // Eliminar sesión de base de datos
      await DB.prepare("DELETE FROM sesiones_voluntarios WHERE token = ?").bind(token).run();
    }

    // Limpiar cookie
    context.cookies.delete("session_token", { path: "/" });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al cerrar sesión de voluntario:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
