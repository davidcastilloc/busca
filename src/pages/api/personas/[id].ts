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

    if (!body.estado || !estadoValidos.includes(body.estado)) {
      return new Response(JSON.stringify({ error: "Estado inválido. Usar: vivo, herido, fallecido, desconocido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await DB.prepare(
      "UPDATE personas SET estado = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(body.estado, Number(id)).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: "Persona no encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, id: Number(id), estado: body.estado }), {
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
