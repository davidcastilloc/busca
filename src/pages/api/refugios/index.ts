import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../../lib/auth-helpers";

export const prerender = false;

// GET /api/refugios - Listar o buscar refugios
export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const url = new URL(context.request.url);
    const query = url.searchParams.get("q")?.trim() || "";

    let sql = `
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'refugio' as tipo, 
             capacidad_maxima, ocupacion_actual, ninos, bebes_lactantes, adultos_mayores, 
             personal_profesional, voluntarios, inventario, fecha_registro, created_at, updated_at, fotos, created_by, updated_by
      FROM refugios
      UNION ALL
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'centro_acopio' as tipo, 
             NULL as capacidad_maxima, NULL as ocupacion_actual, NULL as ninos, NULL as bebes_lactantes, NULL as adultos_mayores,
             NULL as personal_profesional, NULL as voluntarios, inventario, fecha_registro, created_at, updated_at, fotos, created_by, updated_by
      FROM centros_acopio
      UNION ALL
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'hospital' as tipo, 
             NULL as capacidad_maxima, NULL as ocupacion_actual, NULL as ninos, NULL as bebes_lactantes, NULL as adultos_mayores,
             NULL as personal_profesional, NULL as voluntarios, NULL as inventario, fecha_registro, created_at, updated_at, fotos, created_by, updated_by
      FROM hospitales
    `;
    const params: any[] = [];

    if (query) {
      const term = `%${query}%`;
      sql = `SELECT * FROM (${sql}) WHERE nombre LIKE ? OR necesidades LIKE ? OR direccion LIKE ?`;
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
    if (!DB) {
      return new Response(JSON.stringify({ error: "Base de datos no disponible." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verificar sesión de voluntario
    const sessionToken = context.cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    if (!voluntario) {
      return new Response(JSON.stringify({ error: "Acceso no autorizado. Debe iniciar sesión como voluntario." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const { 
      nombre, 
      direccion, 
      latitud, 
      longitud, 
      capacidad_maxima, 
      ocupacion_actual, 
      necesidades, 
      contacto,
      tipo,
      encargado,
      ninos,
      bebes_lactantes,
      adultos_mayores,
      personal_profesional,
      voluntarios,
      inventario,
      fotos
    } = body;

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

    let res: { id: number } | null = null;
    const currentTable = tipo === "centro_acopio" ? "centros_acopio" : tipo === "hospital" ? "hospitales" : "refugios";

    if (tipo === "centro_acopio") {
      res = await DB.prepare(`
        INSERT INTO centros_acopio (
          nombre, direccion, latitud, longitud, contacto, necesidades, 
          inventario, encargado, fotos, fecha_registro, updated_at, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'), ?)
        RETURNING id
      `).bind(
        nombre.trim(),
        direccion ? direccion.trim() : null,
        lat,
        lon,
        contacto ? contacto.trim() : null,
        necesidades ? necesidades.trim() : null,
        inventario ? (typeof inventario === 'string' ? inventario : JSON.stringify(inventario)) : null,
        encargado ? encargado.trim() : null,
        fotos ? (typeof fotos === 'string' ? fotos : JSON.stringify(fotos)) : null,
        voluntario.id
      ).first<{ id: number }>();
    } else if (tipo === "hospital") {
      res = await DB.prepare(`
        INSERT INTO hospitales (
          nombre, direccion, latitud, longitud, contacto, necesidades, 
          encargado, fotos, fecha_registro, updated_at, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'), ?)
        RETURNING id
      `).bind(
        nombre.trim(),
        direccion ? direccion.trim() : null,
        lat,
        lon,
        contacto ? contacto.trim() : null,
        necesidades ? necesidades.trim() : null,
        encargado ? encargado.trim() : null,
        fotos ? (typeof fotos === 'string' ? fotos : JSON.stringify(fotos)) : null,
        voluntario.id
      ).first<{ id: number }>();
    } else {
      // Default: refugio
      res = await DB.prepare(`
        INSERT INTO refugios (
          nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, 
          necesidades, contacto, encargado, ninos, bebes_lactantes, 
          adultos_mayores, personal_profesional, voluntarios, inventario, 
          fotos, fecha_registro, updated_at, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'), ?)
        RETURNING id
      `).bind(
        nombre.trim(),
        direccion ? direccion.trim() : null,
        lat,
        lon,
        capacidad_maxima ? parseInt(capacidad_maxima) : 100,
        ocupacion_actual ? parseInt(ocupacion_actual) : 0,
        necesidades ? necesidades.trim() : null,
        contacto ? contacto.trim() : null,
        encargado ? encargado.trim() : null,
        ninos ? parseInt(ninos) : 0,
        bebes_lactantes ? parseInt(bebes_lactantes) : 0,
        adultos_mayores ? parseInt(adultos_mayores) : 0,
        personal_profesional ? parseInt(personal_profesional) : 0,
        voluntarios ? parseInt(voluntarios) : 0,
        inventario ? (typeof inventario === 'string' ? inventario : JSON.stringify(inventario)) : null,
        fotos ? (typeof fotos === 'string' ? fotos : JSON.stringify(fotos)) : null,
        voluntario.id
      ).first<{ id: number }>();
    }

    // Loguear actividad
    if (res?.id) {
      await DB.prepare(`
        INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
        VALUES (?, 'CREAR', ?, ?, datetime('now', '-4 hours'))
      `).bind(voluntario.id, currentTable, res.id).run();
    }

    return new Response(JSON.stringify({ success: true, id: res?.id }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar refugio:", error);
    // Controlar duplicados (Unique constraint on nombre)
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      return new Response(JSON.stringify({ error: "Ya existe un registro con ese nombre." }), {
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
