import { TelegramClient } from "./client";

export async function notifyAdmins(
  env: any,
  message: string
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const adminIdsStr = env.TELEGRAM_ADMIN_IDS;

  if (!token || !adminIdsStr) {
    // No está configurado el bot de Telegram, ignorar de forma silenciosa
    return;
  }

  try {
    const client = new TelegramClient(token);
    const adminIds = adminIdsStr.split(",").map((id: string) => id.trim());

    for (const adminId of adminIds) {
      if (adminId) {
        try {
          await client.sendMessage(adminId, message);
        } catch (err) {
          console.error(`Error enviando notificación de Telegram al admin ${adminId}:`, err);
        }
      }
    }
  } catch (error) {
    console.error("Error en helper notifyAdmins:", error);
  }
}
