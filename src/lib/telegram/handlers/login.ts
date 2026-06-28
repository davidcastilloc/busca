import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";
import { hashPIN } from "../../auth-helpers";

export async function startLogin(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  // Inicializar flujo
  await setSession(db, telegramId, chatId, "log_telefono", {});
  await client.sendMessage(
    chatId,
    "👤 <b>Identificación de Voluntario</b>\n\nPor favor, escribe tu número de <b>Teléfono</b> registrado (ej. 04127654321):\n\n<i>Escribe /cancelar para abortar.</i>"
  );
}

export async function handleLoginState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Login cancelado.");
    return;
  }

  // 1. Esperando Teléfono
  if (currentStep === "log_telefono") {
    if (!text || text.trim().startsWith("/")) {
      await client.sendMessage(chatId, "⚠️ Envía un número de teléfono válido:");
      return;
    }

    const cleanedTelefono = text.replace(/[^0-9+]/g, "").trim();
    if (cleanedTelefono.length < 7) {
      await client.sendMessage(chatId, "⚠️ Número de teléfono muy corto. Envía un número válido:");
      return;
    }

    data.telefono = cleanedTelefono;
    await setSession(db, telegramId, chatId, "log_pin", data);
    await client.sendMessage(
      chatId,
      `Teléfono: <b>${data.telefono}</b>\n\nAhora, escribe tu <b>PIN de 4 dígitos</b>:`
    );
    return;
  }

  // 2. Esperando PIN
  if (currentStep === "log_pin") {
    if (!text) {
      await client.sendMessage(chatId, "⚠️ Escribe tu PIN de 4 dígitos:");
      return;
    }

    const cleanedPin = text.replace(/[^0-9]/g, "").trim();
    if (cleanedPin.length !== 4) {
      await client.sendMessage(chatId, "⚠️ El PIN debe ser exactamente de 4 dígitos numéricos:");
      return;
    }

    try {
      const pinHash = await hashPIN(cleanedPin);

      // Buscar voluntario por teléfono
      const voluntario = await db
        .prepare("SELECT * FROM voluntarios WHERE telefono = ? AND activo = 1")
        .bind(data.telefono)
        .first<{ id: number; nombre: string; pin_hash: string }>();

      if (!voluntario || voluntario.pin_hash !== pinHash) {
        await client.sendMessage(
          chatId,
          "❌ <b>Credenciales incorrectas</b>\n\nEl teléfono o el PIN no coinciden. Por favor, vuelve a iniciar el proceso con /login."
        );
        await clearSession(db, telegramId);
        return;
      }

      // Actualizar telegram_id del voluntario
      // Desvincular si este telegram_id ya estaba vinculado a otra cuenta para evitar conflictos
      await db.prepare("UPDATE voluntarios SET telegram_id = NULL WHERE telegram_id = ?").bind(String(telegramId)).run();
      
      // Vincular al nuevo
      await db
        .prepare("UPDATE voluntarios SET telegram_id = ? WHERE id = ?")
        .bind(String(telegramId), voluntario.id)
        .run();

      await client.sendMessage(
        chatId,
        `✅ <b>¡Identificación Exitosa!</b>\n\nHola, <b>${voluntario.nombre}</b>. Ahora el sistema te reconoce como voluntario en Telegram. Puedes usar comandos especiales como /inventario, /censo, /refugio y /encontrado.`
      );
    } catch (err) {
      console.error("Error en login de voluntario Telegram:", err);
      await client.sendMessage(chatId, "❌ Error de conexión al validar credenciales.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
