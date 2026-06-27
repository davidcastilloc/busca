import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// GET /api/refugios/[id] - Detalle de un refugio
export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const id = context.params.id;

    if (!id) {
      return new Response(JSON.stringify({ error: "ID de refugio requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const refugio = await DB.prepare("SELECT * FROM refugios WHERE id = ?").bind(id).first();
    if (!refugio) {
      return new Response(JSON.stringify({ error: "Refugio no encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(refugio), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al obtener detalle del refugio:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// PATCH /api/refugios/[id] - Actualizar necesidades, ocupación actual, etc.
export const PATCH: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const id = context.params.id;
    const body = await context.request.json();

    if (!id) {
      return new Response(JSON.stringify({ error: "ID de refugio requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verificar existencia
    const existente = await DB.prepare("SELECT id FROM refugios WHERE id = ?").bind(id).first();
    if (!existente) {
      return new Response(JSON.stringify({ error: "Refugio no encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { ocupacion_actual, capacidad_maxima, necesidades, contacto, direccion } = body;

    // Construir campos de actualización
    const fields: string[] = [];
    const params: any[] = [];

    if (ocupacion_actual !== undefined) {
      fields.push("ocupacion_actual = ?");
      params.push(parseInt(ocupacion_actual));
    }
    if (capacidad_maxima !== undefined) {
      fields.push("capacidad_maxima = ?");
      params.push(parseInt(capacidad_maxima));
    }
    if (necesidades !== undefined) {
      fields.push("necesidades = ?");
      params.push(necesidades ? necesidades.trim() : null);
    }
    if (contacto !== undefined) {
      fields.push("contacto = ?");
      params.push(contacto ? contacto.trim() : null);
    }
    if (direccion !== undefined) {
      fields.push("direccion = ?");
      params.push(direccion ? direccion.trim() : null);
    }

    if (fields.length === 0) {
      return new Response(JSON.stringify({ error: "No se proporcionaron campos para actualizar." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Agregar fecha de actualización
    fields.push("updated_at = datetime('now')");

    // Parámetro ID final
    params.push(id);

    const sql = `UPDATE refugios SET ${fields.join(", ")} WHERE id = ?`;
    await DB.prepare(sql).bind(...params).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al actualizar refugio:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
