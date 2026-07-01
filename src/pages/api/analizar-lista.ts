import type { APIRoute } from "astro";
import { extraerNombresDeImagen } from "../../lib/ai";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ success: false, error: "No se proporcionó archivo." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Usar la IA localmente (síncrono)
    const imageBuffer = await file.arrayBuffer();
    const personas = await extraerNombresDeImagen(env, imageBuffer);

    return new Response(JSON.stringify({ success: true, personas }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al analizar lista con IA:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
