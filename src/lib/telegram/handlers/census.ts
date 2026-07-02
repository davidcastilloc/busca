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

      await client.sendMessage(chatId, `✅ ¡IA terminó! Se encontraron <b>${personas.length}</b> personas en la lista.\nGuardando en base de datos...`);

      let voluntarioId: number | null = null;
      try {
        const v = await db.prepare("SELECT id FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<{id: number}>();
        if (v) voluntarioId = v.id;
      } catch (e) {
        // ignore error
      }

      const { procesarCensoBatch } = await import("../../db");
      const { results } = await procesarCensoBatch(
        db,
        personas,
        data.ubicacion,
        `Voluntario Telegram (ID: ${telegramId})`,
        null,
        voluntarioId
      );

      // Disparar notificaciones Push
      try {
        const PUSH_QUEUE = env.PUSH_QUEUE;
        if (PUSH_QUEUE) {
          let familiarSubscriptions: any[] | null = null;
          for (const res of results) {
            if (res.matches.length > 0) {
              if (familiarSubscriptions === null) {
                const subRes = await db.prepare(
                  "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'familiar'"
                ).all<{ endpoint: string; p256dh: string; auth: string }>();
                familiarSubscriptions = subRes.results || [];
              }

              if (familiarSubscriptions.length > 0) {
                const BATCH_SIZE = 50;
                for (const reporte of res.matches) {
                  for (let i = 0; i < familiarSubscriptions.length; i += BATCH_SIZE) {
                    const subBatch = familiarSubscriptions.slice(i, i + BATCH_SIZE);
                    await PUSH_QUEUE.send({
                      type: "push_batch",
                      payload: {
                        titulo: "¡Familiar Encontrado!",
                        mensaje: `${reporte.nombre_buscado} ha sido registrado localizado en el refugio: ${data.ubicacion || "Refugio de emergencia"}.`,
                        tipo: "info",
                        url: `/?q=${encodeURIComponent(reporte.nombre_buscado)}`
                      },
                      suscripciones: subBatch.map((s) => ({
                        endpoint: s.endpoint,
                        keys: { p256dh: s.p256dh, auth: s.auth }
                      }))
                    });
                  }
                }
              }
            }
          }
        }
      } catch (pushErr) {
        console.error("Error al enviar push en background:", pushErr);
      }

      await client.sendMessage(chatId, "🟢 Lista procesada e ingresada masivamente. ¡Buen trabajo, cavernícola!");

    } catch (err) {
      console.error("Error en censo masivo Telegram:", err);
      await client.sendMessage(chatId, "❌ Ocurrió un error leyendo la foto o guardando los datos.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
