import type { TelegramClient } from "../client";

export async function handleAcopio(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  // Verificamos si este voluntario está vinculado a un refugio
  const voluntario = await db.prepare("SELECT * FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<any>();
  
  if (!voluntario) {
    await client.sendMessage(chatId, "❌ No se encontró tu perfil de voluntario.");
    return;
  }

  // Por ahora lo hacemos general, le damos el link seguro.
  // Podríamos generar un token de sesión rápido o usar el magic link simple.
  const dashboardUrl = `https://dondeestan.org/acopio`;

  let mensaje = `📦 <b>Dashboard de Centros de Acopio</b>\n\n`;
  mensaje += `Hola <b>${voluntario.nombre}</b>. Para coordinar la recepción de donaciones y el despacho de ayudas hacia otros refugios, abre tu panel de control aquí:\n\n`;
  mensaje += `👉 <a href="${dashboardUrl}">Abrir Dashboard de Logística</a>`;

  await client.sendMessage(chatId, mensaje, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🖥️ Abrir Dashboard", url: dashboardUrl }]
      ]
    }
  });
}
