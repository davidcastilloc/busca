import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { AI, DB } = env;
    if (!AI) throw new Error("Workers AI no disponible");
    if (!DB) throw new Error("Base de datos no disponible");

    const sessionToken = context.cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    if (!voluntario) {
      return new Response(JSON.stringify({ error: "No autorizado. Solo voluntarios." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const audioBuffer = await context.request.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: "Audio vacío" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const response = await AI.run("@cf/openai/whisper", {
      audio: [...new Uint8Array(audioBuffer)]
    });

    return new Response(JSON.stringify({ text: response.text || "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en transcripción de audio:", error);
    return new Response(JSON.stringify({ error: error.message || "Error al transcribir" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
