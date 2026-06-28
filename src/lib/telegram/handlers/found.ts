import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startFound(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  args?: string
): Promise<void> {
  const data: any = {};
  
  if (args && args.trim().length > 0) {
    data.cedula_buscado = args.trim();
    await setSession(db, telegramId, chatId, "fnd_name", data);
    await client.sendMessage(
      chatId,
      `✅ Cédula recibida: <b>${data.cedula_buscado}</b>\n\nEnvía el <b>Nombre y Apellido</b> de la persona encontrada (o escribe /saltar si no lo sabes):`
    );
  } else {
    await setSession(db, telegramId, chatId, "fnd_cedula", {});
    await client.sendMessage(
      chatId,
      "🟢 <b>Reportar Persona Encontrada</b>\n\nEnvía el <b>Número de Cédula</b> de la persona (o escribe /saltar si no lo sabes):\n\n<i>/cancelar para salir.</i>"
    );
  }
}

export async function handleFoundState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  photoArray?: any[],
  env?: any
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Reporte cancelado.");
    return;
  }

  // 1. Esperando Cédula
  if (currentStep === "fnd_cedula") {
    if (!text) {
      await client.sendMessage(chatId, "⚠️ Envía la cédula o escribe /saltar:");
      return;
    }
    if (text !== "/saltar") {
      data.cedula_buscado = text.trim();
    }
    await setSession(db, telegramId, chatId, "fnd_name", data);
    await client.sendMessage(
      chatId,
      "Ahora envía el <b>Nombre y Apellido</b> de la persona:"
    );
    return;
  }

  // 2. Esperando Nombre
  if (currentStep === "fnd_name") {
    if (!text || (text.trim().length < 3 && text !== "/saltar")) {
      await client.sendMessage(chatId, "⚠️ Nombre muy corto. Envíalo de nuevo:");
      return;
    }
    if (text !== "/saltar") {
      data.nombre_buscado = text.trim();
    }
    await setSession(db, telegramId, chatId, "fnd_ubicacion", data);
    await client.sendMessage(
      chatId,
      "📍 ¿En qué <b>refugio o ubicación</b> se encuentra ahora?"
    );
    return;
  }

  // 3. Esperando Ubicación
  if (currentStep === "fnd_ubicacion") {
    if (!text || text.trim().length < 3) {
      await client.sendMessage(chatId, "⚠️ Ubicación muy corta. Envíala de nuevo:");
      return;
    }
    data.ubicacion_nombre = text.trim();
    await setSession(db, telegramId, chatId, "fnd_photo", data);
    await client.sendMessage(
      chatId,
      "Por último, puedes enviar una <b>foto de la persona</b> (opcional). Escribe /saltar o 'listo' si no tienes foto:"
    );
    return;
  }

  // 4. Esperando Foto y finalizar
  if (currentStep === "fnd_photo") {
    let fotoKey: string | null = null;

    if (photoArray && photoArray.length > 0 && env?.FOTOS_BUCKET) {
      try {
        await client.sendMessage(chatId, "⏳ Subiendo foto...");
        const sortedPhotos = photoArray.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        const fileId = sortedPhotos[0].file_id;
        const fileInfo = await client.getFile(fileId);
        const blob = await client.downloadFile(fileInfo.file_path);
        const arrayBuffer = await blob.arrayBuffer();
        const ext = fileInfo.file_path.split(".").pop() || "jpg";
        fotoKey = `fotos/tg_fnd_${Date.now()}-${crypto.randomUUID()}.${ext}`;
        await env.FOTOS_BUCKET.put(fotoKey, arrayBuffer, {
          httpMetadata: { contentType: blob.type || "image/jpeg" },
        });
      } catch (err) {
        console.error("Error subiendo foto (encontrado):", err);
        await client.sendMessage(chatId, "⚠️ Falló la foto, guardando sin ella.");
      }
    } else if (text !== "/saltar" && text?.toLowerCase() !== "listo" && !text) {
      await client.sendMessage(chatId, "⚠️ Envía una foto o /saltar para terminar:");
      return;
    }

    data.foto_key = fotoKey;

    try {
      if (env?.CENSO_QUEUE) {
        await env.CENSO_QUEUE.send({
          type: "reporte",
          data: {
            tipo: "encontrado",
            nombre_buscado: data.nombre_buscado,
            cedula_buscado: data.cedula_buscado,
            descripcion: "Reportado como a salvo por voluntario.",
            ubicacion_nombre: data.ubicacion_nombre,
            reportante_nombre: "Voluntario (Telegram)",
            reportante_contacto: `User ID: ${telegramId}`,
            foto_key: data.foto_key,
          },
        });
        await client.sendMessage(
          chatId,
          `✅ <b>Persona registrada como A SALVO</b>\n\nLa información se cruza automáticamente con la lista de desaparecidos.`
        );
      }
    } catch (queueErr) {
      console.error("Queue send error:", queueErr);
      await client.sendMessage(chatId, "❌ Error al guardar.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
