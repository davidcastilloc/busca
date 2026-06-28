import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startReport(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  // Inicializar flujo
  await setSession(db, telegramId, chatId, "rep_name", {});
  await client.sendMessage(
    chatId,
    "🚨 <b>Iniciar Reporte de Desaparición</b>\n\nEnvía el <b>Nombre y Apellido</b> de la persona que estás buscando:\n\n<i>Escribe /cancelar en cualquier momento para salir.</i>"
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
  location?: { latitude: number; longitude: number }
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Reporte cancelado.", { reply_markup: { remove_keyboard: true } });
    return;
  }

  // 1. Esperando Nombre
  if (currentStep === "rep_name") {
    if (!text || text.trim().startsWith("/")) {
      await client.sendMessage(chatId, "⚠️ Nombre no válido. Envía el Nombre y Apellido:");
      return;
    }
    data.nombre_buscado = text.trim();
    await setSession(db, telegramId, chatId, "rep_cedula", data);
    await client.sendMessage(
      chatId,
      `Nombre registrado: <b>${data.nombre_buscado}</b>\n\nAhora, introduce el número de <b>Cédula o ID</b> de la persona (si no lo sabes, escribe /saltar o 'no sabe'):`
    );
    return;
  }

  // 2. Esperando Cédula
  if (currentStep === "rep_cedula") {
    if (!text) {
      await client.sendMessage(chatId, "⚠️ Introduce un texto o escribe /saltar:");
      return;
    }
    const cleanText = text.trim();
    if (cleanText.toLowerCase() !== "no sabe" && cleanText !== "/saltar") {
      // Validar si es una cédula
      data.cedula_buscado = cleanText;
    } else {
      data.cedula_buscado = null;
    }

    await setSession(db, telegramId, chatId, "rep_ubicacion", data);
    await client.sendMessage(
      chatId,
      "Cédula registrada.\n\nAhora, escribe <b>dónde estuvo últimamente</b> (última ubicación conocida) o envía tu <b>Ubicación GPS (📎)</b> si estás en el sitio:",
      {
        reply_markup: {
          keyboard: [
            [{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }],
            [{ text: "/cancelar" }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }

  // 2.5 Esperando Ubicación
  if (currentStep === "rep_ubicacion") {
    if (location) {
      data.latitud = location.latitude;
      data.longitud = location.longitude;
      data.ubicacion_nombre = "Ubicación GPS adjunta por Telegram";
    } else if (text && text.trim().length >= 3) {
      data.ubicacion_nombre = text.trim();
    } else {
      await client.sendMessage(
        chatId,
        "⚠️ Indica la última ubicación conocida (ej. 'Centro de Caracas') o envía tu ubicación GPS (📎):"
      );
      return;
    }
    await setSession(db, telegramId, chatId, "rep_desc", data);
    await client.sendMessage(
      chatId,
      "Ubicación registrada.\n\nEscribe una <b>descripción detallada</b> (señas particulares, vestimenta, estado de salud - mínimo 10 caracteres):",
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // 3. Esperando Descripción
  if (currentStep === "rep_desc") {
    if (!text || text.trim().length < 10) {
      await client.sendMessage(
        chatId,
        "⚠️ La descripción es muy corta. Debe tener al menos 10 caracteres. Por favor, detalla más:"
      );
      return;
    }
    data.descripcion = text.trim();
    await setSession(db, telegramId, chatId, "rep_photo", data);
    await client.sendMessage(
      chatId,
      "Descripción registrada.\n\nPor último, envía una <b>foto de la persona</b>. Si no tienes una foto disponible, escribe /saltar o 'listo':"
    );
    return;
  }

  // 4. Esperando Foto
  if (currentStep === "rep_photo") {
    let fotoKey: string | null = null;

    if (photoArray && photoArray.length > 0 && env?.FOTOS_BUCKET) {
      try {
        await client.sendMessage(chatId, "⏳ Subiendo foto al sistema...");

        // Obtener el más grande
        const sortedPhotos = photoArray.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        const fileId = sortedPhotos[0].file_id;

        const fileInfo = await client.getFile(fileId);
        const filePath = fileInfo.file_path;

        const blob = await client.downloadFile(filePath);
        const arrayBuffer = await blob.arrayBuffer();

        const ext = filePath.split(".").pop() || "jpg";
        fotoKey = `fotos/tg_${Date.now()}-${crypto.randomUUID()}.${ext}`;

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

    // Enviar a la cola
    try {
      if (env?.CENSO_QUEUE) {
        let voluntarioId: number | null = null;
        try {
          const v = await db.prepare("SELECT id FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<{id: number}>();
          if (v) voluntarioId = v.id;
        } catch (e) {
          // ignorar error
        }

        const payload = {
          tipo: "desaparecido",
          nombre_buscado: data.nombre_buscado,
          cedula_buscado: data.cedula_buscado,
          descripcion: data.descripcion,
          ubicacion_nombre: data.ubicacion_nombre,
          latitud: data.latitud || null,
          longitud: data.longitud || null,
          reportante_nombre: `Bot Telegram`,
          reportante_contacto: `User ID: ${telegramId}`,
          foto_key: data.foto_key,
          created_by: voluntarioId
        };

        await env.CENSO_QUEUE.send({
          type: "reporte",
          data: payload,
        });

        await client.sendMessage(
          chatId,
          `✅ <b>¡Reporte creado exitosamente!</b>\n\n• <b>Nombre:</b> ${data.nombre_buscado}\n• <b>Cédula:</b> ${data.cedula_buscado || "No especificada"}\n• <b>Estado:</b> Pendiente de validación\n\nEl reporte será indexado y procesado por nuestra IA para alertas en el dashboard web. ¡Gracias!`
        );
      } else {
        throw new Error("CENSO_QUEUE binding not found");
      }
    } catch (queueErr) {
      console.error("Queue send error:", queueErr);
      await client.sendMessage(chatId, "❌ Error al enviar reporte al sistema de cola.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
