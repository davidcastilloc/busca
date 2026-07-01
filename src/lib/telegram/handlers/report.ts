import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";
import { getShelterKeyboard, resolveLocation } from "../utils";

export async function startReport(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  // Inicializar flujo
  await setSession(db, telegramId, chatId, "rep_reporter_name", {});
  await client.sendMessage(
    chatId,
    "🔍 <b>Reportar Persona Desaparecida</b>\n\nPara comenzar, indícame tu <b>Nombre y Apellido</b> (de ti, que estás reportando):\n\n<i>/cancelar para salir.</i>"
  );
}

export async function handleReportState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  photoArray?: any[],
  env?: any,
  location?: { latitude: number; longitude: number },
  isAuthorized: boolean = false
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Reporte cancelado.", { reply_markup: { remove_keyboard: true } });
    return;
  }

  // 1. Esperando Nombre del Reportante
  if (currentStep === "rep_reporter_name") {
    if (!text || text.trim().length < 3 || text.trim().startsWith("/")) {
      await client.sendMessage(chatId, "⚠️ Nombre no válido. Envía tu Nombre y Apellido:");
      return;
    }
    data.reportante_nombre = text.trim();
    await setSession(db, telegramId, chatId, "rep_contacto", data);
    await client.sendMessage(
      chatId,
      `Bien, ${data.reportante_nombre}. Ahora escribe tu <b>número de teléfono de contacto</b> (ej. 0414-1234567):`
    );
    return;
  }

  // 2. Esperando Contacto
  if (currentStep === "rep_contacto") {
    if (!text || text.trim().length < 5) {
      await client.sendMessage(chatId, "⚠️ Por favor, ingresa un número de teléfono válido:");
      return;
    }
    data.reportante_contacto = text.trim();
    await setSession(db, telegramId, chatId, "rep_name", data);
    await client.sendMessage(
      chatId,
      "¡Gracias! Ahora sí, indícame el <b>Nombre y Apellido</b> de la persona desaparecida:"
    );
    return;
  }

  // 3. Esperando Nombre de persona desaparecida
  if (currentStep === "rep_name") {
    if (!text || text.trim().startsWith("/")) {
      await client.sendMessage(chatId, "⚠️ Nombre no válido. Envía el Nombre y Apellido de la persona:");
      return;
    }
    data.nombre_buscado = text.trim();
    await setSession(db, telegramId, chatId, "rep_cedula", data);
    await client.sendMessage(
      chatId,
      `Nombre registrado: <b>${data.nombre_buscado}</b>\n\nAhora, introduce su número de <b>Cédula o ID</b> (si no lo sabes, escribe /saltar):`
    );
    return;
  }

  // 4. Esperando Cédula
  if (currentStep === "rep_cedula") {
    if (!text) {
      await client.sendMessage(chatId, "⚠️ Introduce un texto o escribe /saltar:");
      return;
    }
    const cleanText = text.trim();
    if (cleanText !== "/saltar" && cleanText.toLowerCase() !== "no sabe") {
      data.cedula_buscado = cleanText;
    } else {
      data.cedula_buscado = null;
    }

    await setSession(db, telegramId, chatId, "rep_relation", data);
    await client.sendMessage(
      chatId,
      "¿Cuál es tu <b>vínculo o parentesco</b> con esta persona? (Ej. Madre, Hermano, Amigo, Vecino):"
    );
    return;
  }

  // 5. Esperando Parentesco
  if (currentStep === "rep_relation") {
    if (!text || text.trim().length < 2) {
      await client.sendMessage(chatId, "⚠️ Por favor indica el vínculo (ej. Madre, Hermano):");
      return;
    }
    data.parentesco = text.trim();

    await setSession(db, telegramId, chatId, "rep_location_details", data);
    
    let keyboardOptions: any = {
      keyboard: [
        [{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }],
        [{ text: "/cancelar" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    
    if (isAuthorized) {
      const shelterKeyboard = await getShelterKeyboard(db);
      if (shelterKeyboard) keyboardOptions = shelterKeyboard;
    }

    await client.sendMessage(
      chatId,
      "Vínculo guardado.\n\n¿Dónde fue visto por última vez? Escribe detalladamente el <b>Estado, Ciudad y Sector</b> (Ej. 'Distrito Capital, Caracas, Los Palos Grandes') o envía tu <b>Ubicación GPS (📎)</b> si estás en el sitio exacto:",
      { reply_markup: keyboardOptions }
    );
    return;
  }

  // 6. Esperando Detalles de Ubicación Geográfica
  if (currentStep === "rep_location_details") {
    const resolved = await resolveLocation(db, text, location);
    
    if (!resolved.valid) {
      let keyboardOptions: any = {
        keyboard: [
          [{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }],
          [{ text: "/cancelar" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      if (isAuthorized) {
        const shelterKeyboard = await getShelterKeyboard(db);
        if (shelterKeyboard) keyboardOptions = shelterKeyboard;
      }
      
      await client.sendMessage(
        chatId,
        "⚠️ Indica la última ubicación (ej. 'Caracas, Petare') o envía tu ubicación GPS (📎):",
        { reply_markup: keyboardOptions }
      );
      return;
    }

    data.ubicacion_nombre = resolved.ubicacion_nombre;
    data.latitud = resolved.latitud;
    data.longitud = resolved.longitud;
    data.refugio_id = resolved.refugio_id;
    data.hospital_id = resolved.hospital_id;

    await setSession(db, telegramId, chatId, "rep_desc", data);
    await client.sendMessage(
      chatId,
      "Ubicación registrada.\n\nEscribe ahora los detalles importantes: <b>Señas particulares, vestimenta, estado de salud o medicamentos, y fecha/hora del último contacto</b> (Mínimo 10 caracteres):",
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // 7. Esperando Detalles descriptivos
  if (currentStep === "rep_desc") {
    if (!text || text.trim().length < 10) {
      await client.sendMessage(
        chatId,
        "⚠️ La descripción es muy corta. Debe tener al menos 10 caracteres para ayudar a los rescatistas. Por favor, detalla más:"
      );
      return;
    }
    data.detalles_persona = text.trim();
    await setSession(db, telegramId, chatId, "rep_photo", data);
    await client.sendMessage(
      chatId,
      "Descripción registrada.\n\nPor último, envía una <b>foto de la persona</b> (O escribe /saltar si no tienes una a la mano):"
    );
    return;
  }

  // 8. Esperando Foto y Finalizar
  if (currentStep === "rep_photo") {
    let fotoKey: string | null = null;

    if (photoArray && photoArray.length > 0 && env?.FOTOS_BUCKET) {
      try {
        await client.sendMessage(chatId, "⏳ Subiendo foto al sistema...");

        // Obtener la de mayor calidad
        const sortedPhotos = photoArray.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        const fileId = sortedPhotos[0].file_id;

        const fileInfo = await client.getFile(fileId);
        const filePath = fileInfo.file_path;

        const blob = await client.downloadFile(filePath);
        const arrayBuffer = await blob.arrayBuffer();

        const ext = filePath.split(".").pop() || "jpg";
        fotoKey = `flyers/tg_${Date.now()}-${crypto.randomUUID()}.${ext}`;

        await env.FOTOS_BUCKET.put(fotoKey, arrayBuffer, {
          httpMetadata: { contentType: blob.type || "image/jpeg" },
        });
      } catch (err) {
        console.error("Error subiendo foto desde Telegram a R2:", err);
        await client.sendMessage(chatId, "⚠️ No se pudo procesar la foto. Creando reporte sin ella...");
      }
    } else if (text === "/saltar" || text?.toLowerCase() === "listo") {
      // Sin foto
    } else {
      await client.sendMessage(
        chatId,
        "⚠️ Envía una foto o escribe /saltar para finalizar:"
      );
      return;
    }

    data.foto_key = fotoKey;

    // Compilar descripción en un solo bloque estructurado para la IA y el flyer
    const descConcatenada = `[VINCULO: ${data.parentesco}] [LUGAR: ${data.ubicacion_nombre}] ${data.detalles_persona}`;
    const flyerTitle = `SE BUSCA: ${data.nombre_buscado}`;

    try {
      // 1. Generar Flyer en base de datos D1
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let flyerId = "";
      for (let i = 0; i < 6; i++) {
        flyerId += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      await db.prepare(`
        INSERT INTO flyers (id, title, description, foto_key, phones, socials, tipo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'))
      `).bind(
        flyerId,
        flyerTitle,
        descConcatenada,
        data.foto_key || "",
        JSON.stringify([data.reportante_contacto]),
        JSON.stringify([]),
        "desaparecido"
      ).run();

      // Notificar al canal publico si existe
      if (env.TELEGRAM_CHANNEL_ID) {
        try {
          const flyerUrl = `https://dondeestan.org/flyer/${flyerId}`;
          let msg = `🔴 <b>SE BUSCA: ${flyerTitle}</b>\n\n`;
          const descLimpia = descConcatenada.replace(/\[.*?\]/g, "").trim().substring(0, 200);
          if (descLimpia) msg += `${descLimpia}${descLimpia.length >= 200 ? "..." : ""}\n\n`;
          msg += `📞 <b>Contacto:</b> ${data.reportante_contacto}\n`;
          msg += `\n🔗 <a href="${flyerUrl}">${flyerUrl}</a>\n`;
          msg += `\n<i>— dondeestan.org | Red de Información de Emergencia</i>`;

          await client.sendMessage(env.TELEGRAM_CHANNEL_ID, msg, {
            link_preview_options: { is_disabled: false, url: flyerUrl }
          });
        } catch (e) {
          console.error("Error enviando broadcast de Telegram:", e);
        }
      }

      // 2. Enviar a la cola para la extracción de IA (CENSO_QUEUE)
      if (env?.CENSO_QUEUE) {
        let voluntarioId: number | null = null;
        try {
          const v = await db.prepare("SELECT id FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<{id: number}>();
          if (v) voluntarioId = v.id;
        } catch (e) {
          // ignorar
        }

        const payload = {
          tipo: "desaparecido",
          nombre_buscado: data.nombre_buscado,
          cedula_buscado: data.cedula_buscado,
          descripcion: descConcatenada,
          ubicacion_nombre: data.ubicacion_nombre,
          latitud: data.latitud || null,
          longitud: data.longitud || null,
          refugio_id: data.refugio_id || null,
          hospital_id: data.hospital_id || null,
          reportante_nombre: data.reportante_nombre,
          reportante_contacto: data.reportante_contacto,
          foto_key: data.foto_key,
          created_by: voluntarioId
        };

        await env.CENSO_QUEUE.send({
          type: "reporte",
          data: payload,
        });

        // Respuesta final al usuario
        await client.sendMessage(
          chatId,
          `✅ <b>¡Reporte creado exitosamente!</b>\n\n` +
          `• <b>Nombre:</b> ${data.nombre_buscado}\n` +
          `• <b>Cédula:</b> ${data.cedula_buscado || "No especificada"}\n` +
          `• <b>Reporta:</b> ${data.reportante_nombre} (${data.parentesco})\n\n` +
          `El reporte ya está siendo procesado por nuestra Inteligencia Artificial para el cruce de datos.\n\n` +
          `Hemos generado automáticamente un <b>Cartel de Búsqueda</b> para ti. Ábrelo en el siguiente enlace y compártelo en WhatsApp o Redes Sociales:\n` +
          `🔗 <b>https://dondeestan.org/flyer/${flyerId}</b>`
        );
      } else {
        throw new Error("CENSO_QUEUE binding not found");
      }
    } catch (queueErr) {
      console.error("Queue send error:", queueErr);
      await client.sendMessage(chatId, "❌ Ocurrió un error guardando el reporte en el sistema central.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
