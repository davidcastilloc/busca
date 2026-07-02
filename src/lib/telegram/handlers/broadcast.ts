import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startBroadcast(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  isAdmin: boolean,
  args?: string,
  env?: any
): Promise<void> {
  if (String(chatId) !== String(telegramId)) {
    await client.sendMessage(chatId, "⚠️ Esta operación solo se puede realizar en un chat privado con el bot.");
    return;
  }

  if (!isAdmin) {
    await client.sendMessage(chatId, "🚷 <b>Acceso Denegado.</b>\nSolo los administradores pueden enviar alertas masivas.");
    return;
  }

  if (args && args.trim().length > 0) {
    await sendBroadcastMessage(client, db, chatId, args.trim(), env);
  } else {
    await setSession(db, telegramId, chatId, "brd_mensaje", {});
    await client.sendMessage(
      chatId,
      "📢 <b>Broadcast Global</b>\n\nEscribe el <b>mensaje</b> que deseas enviar a TODOS los voluntarios activos (los que alguna vez han usado este bot):\n\n<i>/cancelar para abortar.</i>"
    );
  }
}

export async function handleBroadcastState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  isAdmin: boolean,
  session: TelegramSession,
  text?: string,
  env?: any
): Promise<void> {
  if (String(chatId) !== String(telegramId)) {
    await client.sendMessage(chatId, "⚠️ Esta operación solo se puede realizar en un chat privado con el bot.");
    return;
  }

  if (!isAdmin) {
    await clearSession(db, telegramId);
    return;
  }

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Broadcast abortado.");
    return;
  }

  if (session.step === "brd_mensaje") {
    if (!text || text.trim().length < 5) {
      await client.sendMessage(chatId, "⚠️ El mensaje es muy corto. Intenta de nuevo:");
      return;
    }
    await clearSession(db, telegramId);
    await sendBroadcastMessage(client, db, chatId, text.trim(), env);
  }
}

async function sendBroadcastMessage(
  client: TelegramClient,
  db: D1Database,
  adminChatId: string | number,
  message: string,
  env?: any
): Promise<void> {
  const finalMessage = `📢 <b>MENSAJE GLOBAL (CENTRO DE MANDO)</b> 📢\n\n${message}`;

  try {
    // Consultar destinatarios en voluntarios activos con telegram_id
    const { results } = await db.prepare(
      "SELECT DISTINCT telegram_id FROM voluntarios WHERE telegram_id IS NOT NULL AND activo = 1"
    ).all<{ telegram_id: string }>();

    if (!results || results.length === 0) {
      await client.sendMessage(adminChatId, "⚠️ No hay voluntarios activos con Telegram registrado para enviar este mensaje.");
      return;
    }

    await client.sendMessage(adminChatId, `⏳ Encolando broadcast para ${results.length} voluntarios en PUSH_QUEUE...`);

    const PUSH_QUEUE = env?.PUSH_QUEUE;
    if (!PUSH_QUEUE) {
      throw new Error("PUSH_QUEUE no configurada en env");
    }

    // Encolar de forma asíncrona en PUSH_QUEUE
    for (const r of results) {
      if (r.telegram_id) {
        await PUSH_QUEUE.send({
          type: "telegram_broadcast",
          payload: {
            chat_id: r.telegram_id,
            mensaje: finalMessage
          }
        });
      }
    }

    await client.sendMessage(
      adminChatId,
      `✅ <b>Broadcast Encolado Exitosamente</b>\n\nSe encolaron ${results.length} mensajes en PUSH_QUEUE.`
    );
  } catch (error: any) {
    console.error("Error en broadcast:", error);
    await client.sendMessage(adminChatId, `❌ Hubo un error al ejecutar el broadcast: ${error.message || error}`);
  }
}
