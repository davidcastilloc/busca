import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// PATCH /api/personas/[id] — actualizar estado de una persona de forma colaborativa
export const PATCH: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const id = context.params.id;

    if (!id || isNaN(Number(id))) {
      return new Response(JSON.stringify({ error: "ID inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const estadoValidos = ["vivo", "herido", "fallecido", "desconocido"];

    if (body.estado && !estadoValidos.includes(body.estado)) {
      return new Response(JSON.stringify({ error: "Estado inválido. Usar: vivo, herido, fallecido, desconocido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const existente: any = await DB.prepare("SELECT * FROM personas WHERE id = ?").bind(Number(id)).first();
    if (!existente) {
      return new Response(JSON.stringify({ error: "Persona no encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const nuevoEstado = body.estado || existente.estado;
    const nuevoRefugio = body.refugio !== undefined ? body.refugio : existente.refugio;
    const nuevoContacto = body.contacto !== undefined ? body.contacto : existente.contacto;
    const nuevaLat = body.latitud !== undefined ? body.latitud : existente.latitud;
    const nuevaLon = body.longitud !== undefined ? body.longitud : existente.longitud;
    const nuevaUbiNombre = body.ubicacion_nombre !== undefined ? body.ubicacion_nombre : existente.ubicacion_nombre;

    await DB.prepare(`
      UPDATE personas 
      SET estado = ?, 
          refugio = ?, 
          contacto = ?, 
          latitud = ?, 
          longitud = ?, 
          ubicacion_nombre = ?, 
          updated_at = datetime('now') 
      WHERE id = ?
    `).bind(nuevoEstado, nuevoRefugio, nuevoContacto, nuevaLat, nuevaLon, nuevaUbiNombre, Number(id)).run();

    return new Response(JSON.stringify({ ok: true, id: Number(id), estado: nuevoEstado }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error actualizando estado de persona:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// GET /api/personas/[id] — obtener detalles de una persona
export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const id = context.params.id;

    if (!id || isNaN(Number(id))) {
      return new Response(JSON.stringify({ error: "ID inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const persona = await DB.prepare("SELECT * FROM personas WHERE id = ?").bind(Number(id)).first();

    if (!persona) {
      return new Response(JSON.stringify({ error: "Persona no encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(persona), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error obteniendo persona:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
