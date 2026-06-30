import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../../lib/auth-helpers";

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
    const accion = body.accion;

    let voluntario: any = null;
    const sessionToken = context.cookies.get("session_token")?.value;
    if (sessionToken) {
      voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    }

    // Reportar localizado es la única acción pública. Todo lo demás requiere sesión de voluntario.
    if (accion !== "reportar_localizado") {
      if (!voluntario) {
        return new Response(JSON.stringify({ error: "No autorizado. Inicie sesión como voluntario." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
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


    if (accion === "reportar_localizado") {

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
            updated_at = datetime('now', '-4 hours'),
            updated_by = ?
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
        voluntario ? voluntario.id : null,
        Number(id)
      ).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now', '-4 hours'))
        `).bind(voluntario.id, Number(id)).run();
      }

      // Notificar administradores por Telegram
      try {
        const { notifyAdmins } = await import("../../../lib/telegram/notify");
        const alertMsg = `⚠️ <b>Nueva Evidencia de Reporte Resuelto (Localizado)</b>\n\n` +
          `• <b>Persona:</b> ${existente.nombre_buscado || "Sin identificar"}\n` +
          `• <b>Cédula:</b> ${existente.cedula_buscado || "No especificada"}\n` +
          `• <b>Contacto reportante:</b> ${body.contacto}\n` +
          `• <b>Notas:</b> <i>"${body.notes || body.notas || "Sin comentarios"}"</i>\n\n` +
          `🔗 <a href="https://dondeestan.org/admin/dashboard">Verificar en Panel de Rescatistas</a>`;
        
        const cfContext = (context.locals as any).cfContext || (context.locals as any).runtime?.ctx;
        if (cfContext?.waitUntil) {
          cfContext.waitUntil(notifyAdmins(env, alertMsg));
        } else {
          await notifyAdmins(env, alertMsg);
        }
      } catch (err) {
        console.error("Error enviando notificación de reporte resuelto a Telegram:", err);
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: nuevoEstado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "aprobar_localizado") {
      nuevaVerificacion = "verificado";
      
      await DB.prepare(`
        UPDATE reportes 
        SET verificacion = ?,
            updated_at = datetime('now', '-4 hours'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevaVerificacion, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now', '-4 hours'))
        `).bind(voluntario.id, Number(id)).run();
      }

      // Resolver en cascada reportes de tipo desaparecido asociados
      if (existente.cedula_buscado) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula_buscado).run();
      }
      
      if (existente.nombre_buscado && existente.nombre_buscado.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${existente.nombre_buscado}%`).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado_reporte: existente.estado_reporte, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "rechazar_localizado") {
      nuevoEstado = "abierto";
      nuevaVerificacion = "ninguna";

      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = ?,
            verificacion = ?,
            persona_id = NULL,
            foto_evidencia_key = NULL,
            contacto_evidencia = NULL,
            notas_evidencia = NULL,
            updated_at = datetime('now', '-4 hours'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevoEstado, nuevaVerificacion, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now', '-4 hours'))
        `).bind(voluntario.id, Number(id)).run();
      }

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
          updated_at = datetime('now', '-4 hours'),
          updated_by = ?
      WHERE id = ?
    `).bind(
      nuevoEstado, 
      nuevoContacto, 
      nuevoRefugio, 
      nuevaLat, 
      nuevaLon, 
      nuevaFotoKey, 
      nuevaDesc,
      voluntario ? voluntario.id : null,
      Number(id)
    ).run();

    if (voluntario) {
      await DB.prepare(`
        INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
        VALUES (?, 'EDITAR', 'reportes', ?, datetime('now', '-4 hours'))
      `).bind(voluntario.id, Number(id)).run();
    }

    // Actualización en cascada clásica si es resuelto y verificado
    if (nuevoEstado === "resuelto" && nuevaVerificacion !== "pendiente") {
      if (existente.cedula_buscado) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula_buscado).run();
      }
      
      if (existente.nombre_buscado && existente.nombre_buscado.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
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
