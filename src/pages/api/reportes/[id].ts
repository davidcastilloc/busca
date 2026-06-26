import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

// PATCH /api/reportes/[id] — actualizar estado de un reporte
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
    const estadoValidos = ["abierto", "resuelto", "archivado"];

    if (!body.estado_reporte || !estadoValidos.includes(body.estado_reporte)) {
      return new Response(JSON.stringify({ error: "Estado inválido. Usar: abierto, resuelto, archivado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const existente: any = await DB.prepare("SELECT * FROM reportes WHERE id = ?").bind(Number(id)).first();
    if (!existente) {
      return new Response(JSON.stringify({ error: "Reporte no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const nuevoContacto = body.contacto !== undefined ? body.contacto : existente.reportante_contacto;
    const nuevoRefugio = body.refugio !== undefined ? body.refugio : existente.ubicacion_nombre;
    const nuevaLat = body.latitud !== undefined ? body.latitud : existente.latitud;
    const nuevaLon = body.longitud !== undefined ? body.longitud : existente.longitud;
    const nuevaFotoKey = body.foto_key !== undefined ? body.foto_key : existente.foto_key;
    
    let nuevaDesc = existente.descripcion;
    if (body.notas) {
      nuevaDesc = `${existente.descripcion}\n\n[RESOLUCIÓN / AUTO-REPORTE]: ${body.notas}`;
    }

    await DB.prepare(`
      UPDATE reportes 
      SET estado_reporte = ?, 
          reportante_contacto = ?, 
          ubicacion_nombre = ?, 
          latitud = ?, 
          longitud = ?, 
          foto_key = ?, 
          descripcion = ?, 
          updated_at = datetime('now') 
      WHERE id = ?
    `).bind(
      body.estado_reporte, 
      nuevoContacto, 
      nuevoRefugio, 
      nuevaLat, 
      nuevaLon, 
      nuevaFotoKey, 
      nuevaDesc, 
      Number(id)
    ).run();

    return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: body.estado_reporte }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error actualizando reporte:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// GET /api/reportes/[id] — obtener detalles de un reporte
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

    const reporte = await DB.prepare("SELECT * FROM reportes WHERE id = ?").bind(Number(id)).first();

    if (!reporte) {
      return new Response(JSON.stringify({ error: "Reporte no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(reporte), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error obteniendo reporte:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
