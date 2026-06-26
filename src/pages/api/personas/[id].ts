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
    const nuevasNotas = body.notas !== undefined ? body.notas : existente.notas;
    const nuevaFotoKey = body.foto_key !== undefined ? body.foto_key : existente.foto_key;

    await DB.prepare(`
      UPDATE personas 
      SET estado = ?, 
          refugio = ?, 
          contacto = ?, 
          latitud = ?, 
          longitud = ?, 
          ubicacion_nombre = ?, 
          notas = ?, 
          foto_key = ?, 
          updated_at = datetime('now') 
      WHERE id = ?
    `).bind(nuevoEstado, nuevoRefugio, nuevoContacto, nuevaLat, nuevaLon, nuevaUbiNombre, nuevasNotas, nuevaFotoKey, Number(id)).run();

    // Actualización en cascada para resolver reportes de búsqueda relacionados
    if (["vivo", "herido"].includes(nuevoEstado)) {
      if (existente.cedula) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula).run();
      }
      
      const nombreCompleto = `${existente.nombre} ${existente.apellido || ""}`.trim();
      if (nombreCompleto.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE (nombre_buscado LIKE ? OR ? LIKE '%' || nombre_buscado || '%') AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${nombreCompleto}%`, nombreCompleto).run();
      }
    }

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
