import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../lib/auth-helpers";

export const POST: APIRoute = async (context) => {
  const { request, cookies } = context;
  try {
    const { DB } = env;
    const sessionToken = cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    const voluntarioId = voluntario ? voluntario.id : null;

    const data = await request.json();
    const personas = data.personas as {nombre: string, cedula: number|null, telefono: string|null, edad: number|null}[];
    const refugio = data.refugio as string || "Desconocido";
    const contacto = data.contacto as string || "";
    const refugio_id = data.refugio_id || null;

    if (!personas || !Array.isArray(personas) || personas.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "La lista de personas está vacía o es inválida." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Encolar trabajo de cruce de datos con D1 en background
    const QUEUE = (env as any).CENSO_QUEUE;
    await QUEUE.send({
      type: "procesar_nombres_censo",
      data: {
        personas: personas,
        refugio: refugio,
        contacto: contacto,
        refugio_id: refugio_id,
        created_by: voluntarioId
      },
      timestamp: Date.now()
    });

    return new Response(JSON.stringify({ success: true, count: personas.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al encolar censo curado:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
