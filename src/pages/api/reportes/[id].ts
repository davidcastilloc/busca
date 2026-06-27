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

    if (body.estado_reporte && !estadoValidos.includes(body.estado_reporte)) {
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

    let nuevoEstado = body.estado_reporte || existente.estado_reporte;
    let nuevoContacto = body.contacto !== undefined ? body.contacto : existente.reportante_contacto;
    let nuevoRefugio = body.refugio !== undefined ? body.refugio : existente.ubicacion_nombre;
    let nuevaLat = body.latitud !== undefined ? body.latitud : existente.latitud;
    let nuevaLon = body.longitud !== undefined ? body.longitud : existente.longitud;
    let nuevaFotoKey = body.foto_key !== undefined ? body.foto_key : existente.foto_key;
    let nuevaDesc = existente.descripcion;

    let nuevaVerificacion = existente.verificacion || "ninguna";
    let nuevaFotoEvidencia = existente.foto_evidencia_key || null;
    let nuevoContactoEvidencia = existente.contacto_evidencia || null;
    let nuevasNotasEvidencia = existente.notas_evidencia || null;

    const accion = body.accion;

    if (accion === "reportar_a_salvo") {
      if (!body.foto_key) {
        return new Response(JSON.stringify({ error: "Foto de evidencia es obligatoria para verificar reporte." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (!body.contacto) {
        return new Response(JSON.stringify({ error: "Contacto es obligatorio para verificar reporte." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      nuevoEstado = "resuelto";
      nuevaVerificacion = "pendiente";
      nuevaFotoEvidencia = body.foto_key;
      nuevoContactoEvidencia = body.contacto;
      nuevasNotasEvidencia = body.notas || null;

      if (body.notas) {
        nuevaDesc = `${existente.descripcion}\n\n[RESOLUCIÓN PENDIENTE]: ${body.notas}`;
      }

      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = ?, 
            contacto_evidencia = ?, 
            foto_evidencia_key = ?, 
            notas_evidencia = ?,
            verificacion = ?,
            reportante_contacto = ?, 
            ubicacion_nombre = ?, 
            latitud = ?, 
            longitud = ?, 
            descripcion = ?,
            updated_at = datetime('now') 
        WHERE id = ?
      `).bind(
        nuevoEstado,
        nuevoContactoEvidencia,
        nuevaFotoEvidencia,
        nuevasNotasEvidencia,
        nuevaVerificacion,
        nuevoContacto,
        nuevoRefugio,
        nuevaLat,
        nuevaLon,
        nuevaDesc,
        Number(id)
      ).run();

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: nuevoEstado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "aprobar_a_salvo") {
      nuevaVerificacion = "verificado";
      
      await DB.prepare(`
        UPDATE reportes 
        SET verificacion = ?,
            updated_at = datetime('now') 
        WHERE id = ?
      `).bind(nuevaVerificacion, Number(id)).run();

      // Resolver en cascada reportes de tipo desaparecido asociados
      if (existente.cedula_buscado) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula_buscado).run();
      }
      
      if (existente.nombre_buscado && existente.nombre_buscado.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${existente.nombre_buscado}%`).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: existente.estado_reporte, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "rechazar_a_salvo") {
      nuevoEstado = "abierto";
      nuevaVerificacion = "ninguna";

      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = ?,
            verificacion = ?,
            foto_evidencia_key = NULL,
            contacto_evidencia = NULL,
            notas_evidencia = NULL,
            updated_at = datetime('now') 
        WHERE id = ?
      `).bind(nuevoEstado, nuevaVerificacion, Number(id)).run();

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: nuevoEstado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // PATCH clásico sin acción
    if (body.notas) {
      nuevaDesc = `${existente.descripcion}\n\n[RESOLUCIÓN]: ${body.notas}`;
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
      nuevoEstado, 
      nuevoContacto, 
      nuevoRefugio, 
      nuevaLat, 
      nuevaLon, 
      nuevaFotoKey, 
      nuevaDesc, 
      Number(id)
    ).run();

    // Actualización en cascada clásica si es resuelto y verificado
    if (nuevoEstado === "resuelto" && nuevaVerificacion !== "pendiente") {
      if (existente.cedula_buscado) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula_buscado).run();
      }
      
      if (existente.nombre_buscado && existente.nombre_buscado.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${existente.nombre_buscado}%`).run();
      }
    }

    return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: nuevoEstado }), {
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
