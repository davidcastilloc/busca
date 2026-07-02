import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startAlerta(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  if (String(chatId) !== String(telegramId)) {
    await client.sendMessage(chatId, "⚠️ Esta operación solo se puede realizar en un chat privado con el bot.");
    return;
  }
  await setSession(db, telegramId, chatId, "sub_waiting_location", {});

  const gpsKeyboard = {
    keyboard: [
      [{ text: "📍 Compartir mi ubicación (GPS)", request_location: true }],
      [{ text: "/cancelar" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await client.sendMessage(
    chatId,
    "🔔 <b>Suscripción a Alertas Geolocalizadas</b>\n\n" +
      "Al suscribirte, el sistema te enviará alertas de peligros en tiempo real y resúmenes de necesidades críticas en tu zona de acción.\n\n" +
      "📍 Por favor, <b>comparte tu ubicación GPS</b> usando el botón de abajo:",
    { reply_markup: gpsKeyboard }
  );
}

export async function handleAlertaState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  location?: { latitude: number; longitude: number }
): Promise<void> {
  if (String(chatId) !== String(telegramId)) {
    await client.sendMessage(chatId, "⚠️ Esta operación solo se puede realizar en un chat privado con el bot.");
    return;
  }
  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Suscripción cancelada.", {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  if (session.step === "sub_waiting_location") {
    if (!location) {
      await client.sendMessage(chatId, "⚠️ Debes presionar el botón <b>📍 Compartir mi ubicación</b> para registrar las coordenadas GPS. O escribe /cancelar para salir.");
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);

      // Insertar o actualizar la suscripción
      await db.prepare(`
        INSERT INTO alertas_suscripciones (telegram_chat_id, latitud, longitud, radio_km, activo, last_active)
        VALUES (?1, ?2, ?3, 10.0, 1, ?4)
        ON CONFLICT(telegram_chat_id) DO UPDATE SET
          latitud = ?2,
          longitud = ?3,
          last_active = ?4,
          activo = 1
      `).bind(
        String(chatId),
        location.latitude,
        location.longitude,
        timestamp
      ).run();

      await client.sendMessage(
        chatId,
        "✅ <b>¡SUSCRIPCIÓN ACTIVA!</b>\n\n" +
          "Recibirás alertas en un radio de <b>10 km</b> de tu posición actual.\n\n" +
          "<i>Si te trasladas a otro sector o albergue, vuelve a enviar tu ubicación ejecutando /alerta.</i>",
        { reply_markup: { remove_keyboard: true } }
      );
    } catch (error) {
      console.error("Error al suscribir alertas:", error);
      await client.sendMessage(chatId, "❌ Ocurrió un error al registrar tu suscripción.", {
        reply_markup: { remove_keyboard: true }
      });
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
