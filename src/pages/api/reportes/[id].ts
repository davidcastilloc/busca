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
    let nuevoRefugioId = body.refugio_id !== undefined ? body.refugio_id : existente.refugio_id;
    let nuevoCentroAcopioId = body.centro_acopio_id !== undefined ? body.centro_acopio_id : existente.centro_acopio_id;
    let nuevoHospitalId = body.hospital_id !== undefined ? body.hospital_id : existente.hospital_id;
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
            refugio_id = ?,
            centro_acopio_id = ?,
            hospital_id = ?,
            updated_at = datetime('now'),
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
        nuevoRefugioId,
        nuevoCentroAcopioId,
        nuevoHospitalId,
        voluntario ? voluntario.id : null,
        Number(id)
      ).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
        `).bind(voluntario.id, Number(id)).run();
      }

      // Notificar administradores por Telegram
      try {
        const { notifyAdmins } = await import("../../../lib/telegram/notify");
        const mapLink = existente.persona_id
          ? `https://dondeestan.org/mapa?tipo=persona&id=${existente.persona_id}`
          : "https://dondeestan.org/admin/dashboard";

        const alertMsg = `⚠️ <b>Nueva Evidencia de Reporte Resuelto (Localizado)</b>\n\n` +
          `• <b>Persona:</b> ${existente.nombre_buscado || "Sin identificar"}\n` +
          `• <b>Cédula:</b> ${existente.cedula_buscado || "No especificada"}\n` +
          `• <b>Contacto reportante:</b> ${body.contacto}\n` +
          `• <b>Notas:</b> <i>"${body.notes || body.notas || "Sin comentarios"}"</i>\n\n` +
          `🔗 <a href="${mapLink}">Ver en el mapa</a>`;
        
        const cfContext = context.locals.cfContext || context.locals.runtime?.ctx;
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
            updated_at = datetime('now'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevaVerificacion, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
        `).bind(voluntario.id, Number(id)).run();
      }

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

    if (accion === "aprobar_refugio") {
      let nuevoRefugioId: number | null = null;
      try {
        let capacidad = 100;
        let ocupacion = 0;
        if (existente.datos_especificos) {
          try {
            const specs = JSON.parse(existente.datos_especificos);
            if (specs.refugio_capacidad) capacidad = parseInt(specs.refugio_capacidad, 10);
            if (specs.refugio_ocupacion) ocupacion = parseInt(specs.refugio_ocupacion, 10);
          } catch {}
        }

        // 1. Intentar insertar directamente en la tabla refugios
        const result = await DB.prepare(`
          INSERT INTO refugios (
            nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, 
            necesidades, contacto, encargado, fecha_registro, updated_at, created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
          RETURNING id
        `).bind(
          existente.nombre_buscado || "Refugio Nuevo",
          existente.ubicacion_nombre || null,
          existente.latitud,
          existente.longitud,
          capacidad,
          ocupacion,
          existente.descripcion,
          existente.reportante_contacto || null,
          existente.reportante_nombre || null,
          voluntario ? voluntario.id : null
        ).first<{ id: number }>();
        
        nuevoRefugioId = result?.id || null;
      } catch (err: any) {
        if (err.message && err.message.includes("UNIQUE constraint failed")) {
          console.warn("⚠️ [Aprobar Refugio] Intento de aprobación duplicado detectado para:", existente.nombre_buscado);
          return new Response(JSON.stringify({ 
            error: "Conflicto",
            message: "Ya existe un refugio registrado con este nombre. No se admiten nombres duplicados."
          }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
          });
        }
        console.error("❌ [Aprobar Refugio] Error inesperado al insertar refugio:", err);
        throw err;
      }

      // 2. Marcar reporte como resuelto y verificado
      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = 'resuelto',
            verificacion = 'verificado',
            refugio_id = ?,
            updated_at = datetime('now'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevoRefugioId || null, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
        `).bind(voluntario.id, Number(id)).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), refugio_id: nuevoRefugioId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "aprobar_necesidad") {
      let nuevaNecesidadId: number | null = null;
      try {
        let categoria = "General";
        let gravedad = "Media (Urgente)";
        let afectados: number | null = null;
        let telefono: string | null = null;
        let refugio_id: number | null = null;
        let centro_acopio_id: number | null = null;
        let hospital_id: number | null = null;

        if (existente.datos_especificos) {
          try {
            const specs = JSON.parse(existente.datos_especificos);
            categoria = specs.categoria || "General";
            gravedad = specs.gravedad || "Media (Urgente)";
            afectados = specs.afectados ?? null;
            telefono = specs.telefono ?? null;
            refugio_id = specs.refugio_id ?? null;
            centro_acopio_id = specs.centro_acopio_id ?? null;
            hospital_id = specs.hospital_id ?? null;
          } catch {}
        }

        const result = await DB.prepare(`
          INSERT INTO necesidades (
            categoria, gravedad, afectados, descripcion, ubicacion_nombre, 
            latitud, longitud, telefono, foto_key, refugio_id, centro_acopio_id, hospital_id, reportante_nombre, reportante_contacto
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `).bind(
          categoria,
          gravedad,
          afectados,
          existente.descripcion,
          existente.ubicacion_nombre || null,
          existente.latitud || null,
          existente.longitud || null,
          telefono,
          existente.foto_key || null,
          refugio_id,
          centro_acopio_id,
          hospital_id,
          existente.reportante_nombre || "Voluntario SOS",
          existente.reportante_contacto || null
        ).first<{ id: number }>();
        
        nuevaNecesidadId = result?.id || null;
      } catch (err: any) {
        console.error("❌ [Aprobar Necesidad] Error inesperado:", err);
        throw err;
      }

      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = 'resuelto',
            verificacion = 'verificado',
            necesidad_id = ?,
            updated_at = datetime('now'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevaNecesidadId || null, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
        `).bind(voluntario.id, Number(id)).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), necesidad_id: nuevaNecesidadId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (accion === "aprobar_encontrado") {
      let nuevoPersonaId: number | null = null;
      try {
        const nombreCompleto = (existente.nombre_buscado || "").trim();
        const partes = nombreCompleto.split(/\s+/);
        const nombre = partes[0] || "Sin Identificar";
        const apellido = partes.slice(1).join(" ") || null;

        let refugio_id: number | null = null;
        let centro_acopio_id: number | null = null;
        let hospital_id: number | null = null;

        if (existente.datos_especificos) {
          try {
            const specs = JSON.parse(existente.datos_especificos);
            refugio_id = specs.refugio_id ?? null;
            centro_acopio_id = specs.centro_acopio_id ?? null;
            hospital_id = specs.hospital_id ?? null;
          } catch {}
        }

        const result = await DB.prepare(`
          INSERT INTO personas (
            nombre, apellido, cedula, estado, contacto, notas, latitud, longitud, foto_key, fuente, refugio_id, hospital_id, centro_acopio_id, created_by, created_at, updated_at
          )
          VALUES (?, ?, ?, 'localizado', ?, ?, ?, ?, ?, 'reporte_web', ?, ?, ?, ?, datetime('now'), datetime('now'))
          RETURNING id
        `).bind(
          nombre,
          apellido,
          existente.cedula_buscado || null,
          existente.reportante_contacto || null,
          existente.descripcion,
          existente.latitud || null,
          existente.longitud || null,
          existente.foto_key || null,
          refugio_id,
          hospital_id,
          centro_acopio_id,
          voluntario ? voluntario.id : null
        ).first<{ id: number }>();
        
        nuevoPersonaId = result?.id || null;
      } catch (err: any) {
        console.error("❌ [Aprobar Encontrado] Error inesperado:", err);
        throw err;
      }

      await DB.prepare(`
        UPDATE reportes 
        SET estado_reporte = 'resuelto',
            verificacion = 'verificado',
            persona_id = ?,
            updated_at = datetime('now'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevoPersonaId || null, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
        `).bind(voluntario.id, Number(id)).run();
      }

      if (existente.cedula_buscado) {
        await DB.prepare(`
          UPDATE reportes 
          SET estado_reporte = 'resuelto', 
              updated_at = datetime('now') 
          WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
        `).bind(existente.cedula_buscado).run();
      }

      return new Response(JSON.stringify({ ok: true, id: Number(id), persona_id: nuevoPersonaId }), {
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
            updated_at = datetime('now'),
            updated_by = ?
        WHERE id = ?
      `).bind(nuevoEstado, nuevaVerificacion, voluntario ? voluntario.id : null, Number(id)).run();

      if (voluntario) {
        await DB.prepare(`
          INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
          VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
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
          refugio_id = ?,
          centro_acopio_id = ?,
          hospital_id = ?,
          updated_at = datetime('now'),
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
      nuevoRefugioId,
      nuevoCentroAcopioId,
      nuevoHospitalId,
      voluntario ? voluntario.id : null,
      Number(id)
    ).run();

    if (voluntario) {
      await DB.prepare(`
        INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
        VALUES (?, 'EDITAR', 'reportes', ?, datetime('now'))
      `).bind(voluntario.id, Number(id)).run();
    }

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
