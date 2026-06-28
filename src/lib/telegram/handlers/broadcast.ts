import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startBroadcast(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  isAdmin: boolean,
  args?: string
): Promise<void> {
  if (!isAdmin) {
    await client.sendMessage(chatId, "🚷 <b>Acceso Denegado.</b>\nSolo los administradores pueden enviar alertas masivas.");
    return;
  }

  if (args && args.trim().length > 0) {
    await sendBroadcastMessage(client, db, chatId, args.trim());
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
  text?: string
): Promise<void> {
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
    await sendBroadcastMessage(client, db, chatId, text.trim());
  }
}

async function sendBroadcastMessage(
  client: TelegramClient,
  db: D1Database,
  adminChatId: string | number,
  message: string
): Promise<void> {
  const finalMessage = `📢 <b>MENSAJE GLOBAL (CENTRO DE MANDO)</b> 📢\n\n${message}`;

  try {
    // Obtener todos los IDs de chat únicos de la sesión (asumiendo que todos los que tienen sesión han interactuado con el bot)
    // Telegram solo permite mandar mensajes a usuarios que han iniciado chat con el bot.
    const { results } = await db.prepare("SELECT DISTINCT chat_id FROM telegram_sessions").all<{ chat_id: string }>();

    if (!results || results.length === 0) {
      await client.sendMessage(adminChatId, "⚠️ No hay usuarios registrados en la base de datos de sesiones para enviar este mensaje.");
      return;
    }

    await client.sendMessage(adminChatId, `⏳ Enviando broadcast a ${results.length} usuarios... (Esto puede tardar en segundo plano)`);

    // Hacemos el envío de forma asíncrona. 
    // Nota: Si son miles de usuarios, habría que implementar una cola de verdad (Workers Queue o cron).
    // Para el scope actual de voluntarios (cientos), un loop directo servirá. No lo hagamos esperar al request completo (usamos un setTimeout o lo mandamos y listo).
    let exitosos = 0;
    let fallidos = 0;

    for (const r of results) {
      if (r.chat_id) {
        try {
          await client.sendMessage(r.chat_id, finalMessage);
          exitosos++;
        } catch (e) {
          fallidos++;
        }
      }
    }

    await client.sendMessage(
      adminChatId,
      `✅ <b>Broadcast Finalizado</b>\n\nEnviados con éxito: ${exitosos}\nFallidos: ${fallidos}\nTotal intentados: ${results.length}`
    );
  } catch (error) {
    console.error("Error en broadcast:", error);
    await client.sendMessage(adminChatId, "❌ Hubo un error al ejecutar el broadcast.");
  }
}
