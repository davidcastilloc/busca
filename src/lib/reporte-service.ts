import type { D1Database } from "@cloudflare/workers-types";
import { ReporteSchema, NecesidadSchema } from "./validators";

export interface CrearReporteResult {
  success: boolean;
  id: number | null;
  message: string;
  error?: string;
  issues?: any[];
  status: number;
}

export async function crearReporteUnificado(
  DB: D1Database,
  body: any,
  voluntarioId: number | null,
  env: any,
  cfContext: any
): Promise<CrearReporteResult> {
  const tipo = body.tipo;

  let validated: any;
  let datos_especificos: any = null;

  // 1. Validar según el tipo de reporte
  if (tipo === "necesidad") {
    validated = NecesidadSchema.parse(body);

    datos_especificos = {
      categoria: validated.categoria,
      gravedad: validated.gravedad,
      afectados: validated.afectados ?? null,
      telefono: validated.telefono ?? null,
      refugio_id: validated.refugio_id ?? null,
      centro_acopio_id: validated.centro_acopio_id ?? null,
      hospital_id: validated.hospital_id ?? null
    };
  } else {
    validated = ReporteSchema.parse(body);

    if (tipo === "refugio") {
      // Validar que no exista un refugio oficial con ese nombre en la base de datos
      if (validated.nombre_buscado) {
        const existeRefugio = await DB.prepare("SELECT id FROM refugios WHERE LOWER(nombre) = LOWER(?)").bind(validated.nombre_buscado.trim()).first();
        if (existeRefugio) {
          return {
            success: false,
            id: null,
            message: "Validación fallida",
            issues: [{
              path: ["refugio_nombre"],
              message: "Ya existe un refugio registrado con este nombre.",
              code: "custom"
            }],
            status: 400
          };
        }

        // Validar que no haya un reporte de refugio pendiente en cola con ese nombre
        const existeReportePendiente = await DB.prepare("SELECT id FROM reportes WHERE tipo = 'refugio' AND estado_reporte = 'abierto' AND LOWER(nombre_buscado) = LOWER(?)").bind(validated.nombre_buscado.trim()).first();
        if (existeReportePendiente) {
          return {
            success: false,
            id: null,
            message: "Validación fallida",
            issues: [{
              path: ["refugio_nombre"],
              message: "Ya existe un reporte de refugio en cola pendiente de aprobación con este nombre.",
              code: "custom"
            }],
            status: 400
          };
        }
      }

      datos_especificos = {
        refugio_tipo: body.refugio_tipo || null,
        refugio_ocupacion: body.refugio_ocupacion || null,
        refugio_capacidad: body.refugio_capacidad || null
      };
    } else {
      // desaparecido / encontrado
      datos_especificos = {
        extra_senas: body.extra_senas || null,
        extra_ultimo_contacto: body.extra_ultimo_contacto || null,
        extra_estado: body.extra_estado || null,
        extra_ciudad: body.extra_ciudad || null,
        extra_sector: body.extra_sector || null
      };
    }
  }

  // 2. Determinar si califica para Aprobación Automática (Inmediata)
  const isVolunteer = !!voluntarioId;
  const autoApprove = (tipo === "necesidad" || tipo === "desaparecido" || isVolunteer);

  let personaId: number | null = null;
  let refugioId: number | null = null;
  let necesidadId: number | null = null;

  // 3. Si es auto-aprobado, insertar de inmediato en la tabla final activa
  if (autoApprove) {
    if (tipo === "necesidad") {
      const result = await DB.prepare(`
        INSERT INTO necesidades (
          categoria, gravedad, afectados, descripcion, ubicacion_nombre, 
          latitud, longitud, telefono, foto_key, refugio_id, centro_acopio_id, hospital_id, reportante_nombre, reportante_contacto
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).bind(
        datos_especificos.categoria,
        datos_especificos.gravedad,
        datos_especificos.afectados,
        validated.descripcion,
        validated.ubicacion_nombre || null,
        validated.latitud || null,
        validated.longitud || null,
        datos_especificos.telefono,
        validated.foto_key || null,
        datos_especificos.refugio_id,
        datos_especificos.centro_acopio_id,
        datos_especificos.hospital_id,
        validated.reportante_nombre || "Voluntario SOS",
        validated.reportante_contacto || null
      ).first<{ id: number }>();
      necesidadId = result?.id || null;
    } else if (tipo === "desaparecido" || (tipo === "encontrado" && isVolunteer)) {
      const nombreCompleto = (validated.nombre_buscado || "").trim();
      const partes = nombreCompleto.split(/\s+/);
      const nombre = partes[0] || "Sin Identificar";
      const apellido = partes.slice(1).join(" ") || null;
      const estadoPersona = tipo === "desaparecido" ? "desaparecido" : "localizado";

      const result = await DB.prepare(`
        INSERT INTO personas (
          nombre, apellido, cedula, estado, contacto, notas, latitud, longitud, foto_key, fuente, refugio_id, hospital_id, centro_acopio_id, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reporte_web', ?, ?, ?, ?, datetime('now'), datetime('now'))
        RETURNING id
      `).bind(
        nombre,
        apellido,
        validated.cedula_buscado || null,
        estadoPersona,
        validated.reportante_contacto || null,
        validated.descripcion,
        validated.latitud || null,
        validated.longitud || null,
        validated.foto_key || null,
        datos_especificos.refugio_id || null,
        datos_especificos.hospital_id || null,
        datos_especificos.centro_acopio_id || null,
        voluntarioId
      ).first<{ id: number }>();
      personaId = result?.id || null;
    } else if (tipo === "refugio" && isVolunteer) {
      try {
        const result = await DB.prepare(`
          INSERT INTO refugios (
            nombre, direccion, latitud, longitud, capacidad_maxima, ocupacion_actual, 
            necesidades, contacto, encargado, fecha_registro, updated_at, created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
          RETURNING id
        `).bind(
          validated.nombre_buscado,
          validated.ubicacion_nombre || null,
          validated.latitud,
          validated.longitud,
          datos_especificos.refugio_capacidad ? parseInt(datos_especificos.refugio_capacidad) : 100,
          datos_especificos.refugio_ocupacion ? parseInt(datos_especificos.refugio_ocupacion) : 0,
          validated.descripcion,
          validated.reportante_contacto || null,
          validated.reportante_nombre || null,
          voluntarioId
        ).first<{ id: number }>();
        refugioId = result?.id || null;
      } catch (err: any) {
        if (err.message && err.message.includes("UNIQUE constraint failed")) {
          return {
            success: false,
            id: null,
            message: "Ya existe un refugio registrado con este nombre.",
            status: 409
          };
        }
        throw err;
      }
    }
  }

  // 4. Insertar la fila en la tabla reportes (fuente de verdad unificada)
  const estadoReporte = autoApprove ? "resuelto" : "abierto";
  const verificacionReporte = autoApprove ? "verificado" : "ninguna";

  const reportResult = await DB.prepare(`
    INSERT INTO reportes (
      tipo, nombre_buscado, cedula_buscado, descripcion, 
      reportante_nombre, reportante_contacto, ubicacion_nombre, 
      latitud, longitud, foto_key, estado_reporte, verificacion,
      persona_id, refugio_id, necesidad_id, datos_especificos, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    RETURNING id
  `).bind(
    tipo,
    tipo === "necesidad" ? validated.categoria : validated.nombre_buscado || null,
    tipo === "necesidad" ? null : validated.cedula_buscado || null,
    validated.descripcion,
    validated.reportante_nombre || null,
    validated.reportante_contacto || null,
    validated.ubicacion_nombre || null,
    validated.latitud || null,
    validated.longitud || null,
    validated.foto_key || null,
    estadoReporte,
    verificacionReporte,
    personaId,
    refugioId,
    necesidadId,
    datos_especificos ? JSON.stringify(datos_especificos) : null,
    voluntarioId
  ).first<{ id: number }>();

  const insertedReportId = reportResult?.id || null;

  // Registrar en historial si fue voluntario
  if (insertedReportId && voluntarioId) {
    await DB.prepare(`
      INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
      VALUES (?, 'CREAR', 'reportes', ?, datetime('now'))
    `).bind(voluntarioId, insertedReportId).run();
  }

  // 5. Notificaciones a Telegram
  if (insertedReportId) {
    const { notifyAdmins, notificarCercanos } = await import("./telegram/notify");
    
    let alertMsg = "";
    let options = undefined;

    if (tipo === "necesidad") {
      alertMsg = `🚨 <b>Nueva Necesidad SOS Recibida (#${necesidadId || "Sync"})</b>\n\n` +
        `• <b>Categoría:</b> ${datos_especificos.categoria}\n` +
        `• <b>Ubicación:</b> ${validated.ubicacion_nombre || "No especificada"}\n\n` +
        `📝 <b>Descripción:</b> <i>"${validated.descripcion}"</i>\n\n` +
        `🔗 <a href="https://dondeestan.org/mapa?tipo=necesidad&id=${necesidadId}">Ver en el mapa</a>`;
    } else if (tipo === "refugio") {
      alertMsg = `🏠 <b>Nuevo Reporte de Refugio Recibido (#${insertedReportId})</b>\n\n` +
        `• <b>Nombre:</b> ${validated.nombre_buscado}\n` +
        `• <b>Ubicación:</b> ${validated.ubicacion_nombre || "No especificada"}\n\n` +
        `📝 <b>Detalle:</b> <i>"${validated.descripcion}"</i>\n\n` +
        `🔗 <a href="https://dondeestan.org/admin/dashboard">Ir al Panel de Moderación</a>`;

      if (!autoApprove) {
        options = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Aprobar Refugio", callback_data: `aprob_ref:${insertedReportId}` },
                { text: "❌ Rechazar", callback_data: `rech_ref:${insertedReportId}` }
              ]
            ]
          }
        };
      }
    } else {
      const actionLabel = tipo === "desaparecido" ? "Persona Desaparecida" : "Persona Encontrada (Requiere Aprobación)";
      alertMsg = `👥 <b>Nuevo Reporte de Persona (#${insertedReportId})</b>\n\n` +
        `• <b>Tipo:</b> ${actionLabel}\n` +
        `• <b>Nombre:</b> ${validated.nombre_buscado || "Sin identificar"}\n` +
        `• <b>Cédula:</b> ${validated.cedula_buscado || "No especificada"}\n\n` +
        `📝 <b>Detalle:</b> <i>"${validated.descripcion}"</i>`;

      if (tipo === "encontrado" && !autoApprove) {
        options = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Aprobar Hallazgo", callback_data: `aprob_enc:${insertedReportId}` },
                { text: "❌ Rechazar", callback_data: `rech_ref:${insertedReportId}` }
              ]
            ]
          }
        };
      } else {
        alertMsg += `\n\n🔗 <a href="https://dondeestan.org/mapa?tipo=persona&id=${personaId}">Ver en el mapa</a>`;
      }
    }

    const triggerNotifications = async () => {
      try {
        await notifyAdmins(env, alertMsg, options);
        if (validated.latitud && validated.longitud) {
          const msg = `🚨 <b>NUEVA ALERTA EN TU ZONA</b>\n\n• Detalle: ${validated.descripcion}`;
          await notificarCercanos(env, validated.latitud, validated.longitud, msg);
        }
      } catch (e) {
        console.error("Error al enviar notificaciones de reporte:", e);
      }
    };

    if (cfContext?.waitUntil) {
      cfContext.waitUntil(triggerNotifications());
    } else {
      await triggerNotifications();
    }
  }

  return {
    success: true,
    id: autoApprove ? (necesidadId || personaId || refugioId) : insertedReportId,
    message: autoApprove ? "Registro activo exitosamente" : "Reporte registrado y en cola de moderación",
    status: 201
  };
}
