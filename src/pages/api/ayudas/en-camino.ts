import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    const body = await context.request.json();
    const necesidadId = body.necesidad_id ? Number(body.necesidad_id) : null;
    const refugioId = body.refugio_id ? Number(body.refugio_id) : null;
    const hospitalId = body.hospital_id ? Number(body.hospital_id) : null;
    const centroAcopioId = body.centro_acopio_id ? Number(body.centro_acopio_id) : null;

    if (!necesidadId && !refugioId && !hospitalId && !centroAcopioId) {
      return new Response(JSON.stringify({ error: "Debe proveer necesidad_id, refugio_id, hospital_id o centro_acopio_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const uuid = "ayuda-" + crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);

    await DB.prepare(`
      INSERT INTO ayudas_en_camino (id, refugio_id, centro_acopio_id, hospital_id, necesidad_id, voluntarios_count, estatus, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'en_ruta', ?)
    `).bind(
      uuid,
      refugioId,
      centroAcopioId,
      hospitalId,
      necesidadId,
      timestamp
    ).run();

    return new Response(JSON.stringify({ success: true, id: uuid }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar ayuda en camino:", error);
    return new Response(JSON.stringify({ error: error.message || "Error interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
