import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../../lib/auth-helpers";

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
    const accion = body.accion;

    // Reportar localizado es la única acción pública, todo lo demás requiere voluntario
    if (accion !== "reportar_localizado") {
      const sessionToken = context.cookies.get("session_token")?.value;
      const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
      if (!voluntario) {
        return new Response(JSON.stringify({ error: "No autorizado. Inicie sesión como voluntario." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    const estadoValidos = ["localizado", "herido", "fallecido", "desconocido"];

    if (body.estado && !estadoValidos.includes(body.estado)) {
      return new Response(JSON.stringify({ error: "Estado inválido. Usar: localizado, herido, fallecido, desconocido" }), {
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

    let nuevoEstado = body.estado || existente.estado;
    let nuevoRefugio = body.refugio !== undefined ? body.refugio : existente.refugio;
    let nuevoContacto = body.contacto !== undefined ? body.contacto : existente.contacto;
    let nuevaLat = body.latitud !== undefined ? body.latitud : existente.latitud;
    let nuevaLon = body.longitud !== undefined ? body.longitud : existente.longitud;
    let nuevaUbiNombre = body.ubicacion_nombre !== undefined ? body.ubicacion_nombre : existente.ubicacion_nombre;
    let nuevasNotas = body.notas !== undefined ? body.notas : existente.notas;
    let nuevaFotoKey = body.foto_key !== undefined ? body.foto_key : existente.foto_key;
    let nuevoRefugioId = body.refugio_id !== undefined ? body.refugio_id : existente.refugio_id;
    let nuevoCentroAcopioId = body.centro_acopio_id !== undefined ? body.centro_acopio_id : existente.centro_acopio_id;
    let nuevoHospitalId = body.hospital_id !== undefined ? body.hospital_id : existente.hospital_id;

    let nuevaVerificacion = existente.verificacion || "ninguna";
    let nuevaFotoEvidencia = existente.foto_evidencia_key || null;
    let nuevoContactoEvidencia = existente.contacto_evidencia || null;
    let nuevasNotasEvidencia = existente.notas_evidencia || null;


    if (accion === "reportar_localizado") {

      if (!body.contacto) {
        return new Response(JSON.stringify({ error: "Contacto telefónico es obligatorio para auto-reporte." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      nuevoEstado = body.estado || "localizado";
      nuevaVerificacion = "pendiente";
      nuevaFotoEvidencia = body.foto_key;
      nuevoContactoEvidencia = body.contacto;
      nuevasNotasEvidencia = body.notas || null;
      
      await DB.prepare(`
        UPDATE personas 
        SET estado = ?, 
            refugio = ?, 
            contacto = ?, 
            latitud = ?, 
            longitud = ?, 
            ubicacion_nombre = ?, 
            notas = ?, 
            verificacion = ?,
            foto_evidencia_key = ?,
            contacto_evidencia = ?,
            notas_evidencia = ?,
            refugio_id = ?,
            centro_acopio_id = ?,
            hospital_id = ?,
            updated_at = datetime('now', '-4 hours') 
        WHERE id = ?
      `).bind(
        nuevoEstado, 
        nuevoRefugio, 
        nuevoContacto, 
        nuevaLat, 
        nuevaLon, 
        nuevaUbiNombre, 
        nuevasNotas, 
        nuevaVerificacion,
        nuevaFotoEvidencia,
        nuevoContactoEvidencia,
        nuevasNotasEvidencia,
        nuevoRefugioId,
        nuevoCentroAcopioId,
        nuevoHospitalId,
        Number(id)
      ).run();

      // Notificar administradores por Telegram
      try {
        const { notifyAdmins } = await import("../../../lib/telegram/notify");
        const alertMsg = `⚠️ <b>Nueva Solicitud de Verificación (Localizado)</b>\n\n` +
          `• <b>Persona:</b> ${existente.nombre} ${existente.apellido || ""}\n` +
          `• <b>Cédula:</b> ${existente.cedula || "No especificada"}\n` +
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
        console.error("Error enviando notificación de auto-reporte a Telegram:", err);
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado: nuevoEstado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "aprobar_localizado") {
      nuevaVerificacion = "verificado";
      
      await DB.prepare(`
        UPDATE personas 
        SET verificacion = ?,
            updated_at = datetime('now', '-4 hours') 
        WHERE id = ?
      `).bind(nuevaVerificacion, Number(id)).run();

      // Resolvemos reportes de búsqueda en cascada
      if (existente.cedula) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula).run();
      }
      
      const nombreCompleto = `${existente.nombre} ${existente.apellido || ""}`.trim();
      if (nombreCompleto.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${nombreCompleto}%`).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado: existente.estado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "rechazar_localizado") {
      nuevoEstado = "desconocido";
      nuevaVerificacion = "ninguna";

      await DB.prepare(`
        UPDATE personas 
        SET estado = ?,
            verificacion = ?,
            foto_evidencia_key = NULL,
            contacto_evidencia = NULL,
            notas_evidencia = NULL,
            updated_at = datetime('now', '-4 hours') 
        WHERE id = ?
      `).bind(nuevoEstado, nuevaVerificacion, Number(id)).run();

      return new Response(JSON.stringify({ ok: true, id: Number(id), estado: nuevoEstado, verificacion: nuevaVerificacion }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Comportamiento normal (PATCH clásico sin accion)
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
          refugio_id = ?,
          centro_acopio_id = ?,
          hospital_id = ?,
          updated_at = datetime('now', '-4 hours') 
      WHERE id = ?
    `).bind(
      nuevoEstado, 
      nuevoRefugio, 
      nuevoContacto, 
      nuevaLat, 
      nuevaLon, 
      nuevaUbiNombre, 
      nuevasNotas, 
      nuevaFotoKey, 
      nuevoRefugioId,
      nuevoCentroAcopioId,
      nuevoHospitalId,
      Number(id)
    ).run();

    // Actualización en cascada clásica si no es pendiente y es localizado/herido
    if (["localizado", "herido"].includes(nuevoEstado) && nuevaVerificacion !== "pendiente") {
      if (existente.cedula) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula).run();
      }
      
      const nombreCompleto = `${existente.nombre} ${existente.apellido || ""}`.trim();
      if (nombreCompleto.length > 3) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now', '-4 hours') 
          WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(`%${nombreCompleto}%`).run();
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
