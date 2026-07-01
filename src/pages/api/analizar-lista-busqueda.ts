import type { APIRoute } from "astro";
import { extraerNombresDeTexto, extraerNombresDeImagen } from "../../lib/ai";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get("content-type") || "";

    let personas: any[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return new Response(JSON.stringify({ success: false, error: "No se proporcionó archivo de imagen." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const imageBuffer = await file.arrayBuffer();
      personas = await extraerNombresDeImagen(env, imageBuffer);
    } else {
      // Intentar parsear como JSON
      const body = await request.json();
      const text = body.text as string || "";

      if (!text || text.trim().length < 3) {
        return new Response(JSON.stringify({ success: false, error: "Texto demasiado corto para analizar." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      personas = await extraerNombresDeTexto(env, text);
    }

    return new Response(JSON.stringify({ success: true, personas }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al analizar lista de búsqueda con IA:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
