import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// GET /api/refugios - Listar o buscar refugios
export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";

    let sql = "SELECT * FROM refugios";
    const params: any[] = [];

    if (query) {
      const term = `%${query}%`;
      sql += " WHERE nombre LIKE ? OR necesidades LIKE ? OR direccion LIKE ?";
      params.push(term, term, term);
    }

    sql += " ORDER BY nombre ASC";

    const res = await DB.prepare(sql).bind(...params).all();
    return new Response(JSON.stringify({ refugios: res.results || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al listar refugios:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// POST /api/refugios - Crear un nuevo refugio
export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const body = await context.request.json();
    const { nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, necesidades, contacto } = body;

    // Validar requeridos
    if (!nombre || !latitud || !longitud) {
      return new Response(JSON.stringify({ error: "Nombre, latitud y longitud son requeridos." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const lat = parseFloat(latitud);
    const lon = parseFloat(longitud);

    if (isNaN(lat) || isNaN(lon)) {
      return new Response(JSON.stringify({ error: "Coordenadas latitud/longitud inválidas." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Insertar en D1
    const res = await DB.prepare(`
      INSERT INTO refugios (nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, necesidades, contacto, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      RETURNING id
    `).bind(
      nombre.trim(),
      direccion ? direccion.trim() : null,
      lat,
      lon,
      capacidad_maxima ? parseInt(capacidad_maxima) : 100,
      ocupacion_actual ? parseInt(ocupacion_actual) : 0,
      necesidades ? necesidades.trim() : null,
      contacto ? contacto.trim() : null
    ).first<{ id: number }>();

    return new Response(JSON.stringify({ success: true, id: res?.id }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar refugio:", error);
    // Controlar duplicados (Unique constraint on nombre)
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      return new Response(JSON.stringify({ error: "Ya existe un refugio registrado con ese nombre." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
