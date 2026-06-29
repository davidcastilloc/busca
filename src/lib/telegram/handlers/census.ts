import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";
import { extraerNombresDeImagen } from "../../ai";

export async function startCensus(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  args?: string
): Promise<void> {
  if (args && args.trim().length > 0) {
    await setSession(db, telegramId, chatId, "cen_photo", { ubicacion: args.trim() });
    await client.sendMessage(
      chatId,
      `✅ Refugio/Ubicación: <b>${args.trim()}</b>\n\nEnvía una <b>FOTO</b> de la lista escrita a mano o impresa. La Inteligencia Artificial la leerá.`
    );
  } else {
    await setSession(db, telegramId, chatId, "cen_ubicacion", {});
    await client.sendMessage(
      chatId,
      "📝 <b>Censo Masivo con IA</b>\n\nPrimero, dime en qué <b>Refugio o Ubicación</b> se hizo esta lista:\n\n<i>/cancelar para salir.</i>"
    );
  }
}

export async function handleCensusState(
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
    await client.sendMessage(chatId, "❌ Censo cancelado.");
    return;
  }

  // 1. Esperando Ubicación
  if (currentStep === "cen_ubicacion") {
    if (!text || text.trim().length < 3) {
      await client.sendMessage(chatId, "⚠️ Ubicación muy corta. Intenta de nuevo:");
      return;
    }
    data.ubicacion = text.trim();
    await setSession(db, telegramId, chatId, "cen_photo", data);
    await client.sendMessage(
      chatId,
      "Ahora envía una <b>FOTO legible</b> de la lista."
    );
    return;
  }

  // 2. Esperando Foto
  if (currentStep === "cen_photo") {
    if (!photoArray || photoArray.length === 0) {
      await client.sendMessage(chatId, "⚠️ Tienes que enviar una FOTO (imagen) de la lista. Intenta de nuevo:");
      return;
    }

    await client.sendMessage(chatId, "⏳ Descargando imagen y pasando por la IA. Esto puede tardar unos 10-20 segundos, no toques nada...");

    try {
      const sortedPhotos = photoArray.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
      const fileId = sortedPhotos[0].file_id;
      const fileInfo = await client.getFile(fileId);
      const blob = await client.downloadFile(fileInfo.file_path);
      const arrayBuffer = await blob.arrayBuffer();

      // Procesar con IA
      const personas = await extraerNombresDeImagen(env, arrayBuffer);

      if (!personas || personas.length === 0) {
        await client.sendMessage(chatId, "❌ No se pudo extraer ningún nombre de la imagen. Asegúrate de que sea legible e intenta de nuevo.");
        return;
      }

      await client.sendMessage(chatId, `✅ ¡IA terminó! Se encontraron <b>${personas.length}</b> personas en la lista.\nGuardando en base de datos en segundo plano...`);

      // Enviar a la cola para registro asíncrono
      if (env?.CENSO_QUEUE) {
        let voluntarioId: number | null = null;
        try {
          const v = await db.prepare("SELECT id FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<{id: number}>();
          if (v) voluntarioId = v.id;
        } catch (e) {
          // ignore error
        }

        await env.CENSO_QUEUE.send({
          type: "procesar_nombres_censo",
          data: {
            personas,
            refugio: data.ubicacion,
            contacto: `Voluntario Telegram (ID: ${telegramId})`,
            created_by: voluntarioId
          }
        });
        await client.sendMessage(chatId, "🟢 Lista enviada a procesamiento masivo. ¡Buen trabajo, cavernícola!");
      } else {
        await client.sendMessage(chatId, "⚠️ No hay conexión con la cola. Los datos no se guardaron.");
      }

    } catch (err) {
      console.error("Error en censo masivo Telegram:", err);
      await client.sendMessage(chatId, "❌ Ocurrió un error leyendo la foto o guardando los datos.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
