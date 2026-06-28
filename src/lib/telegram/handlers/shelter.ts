import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startShelter(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  args?: string
): Promise<void> {
  if (args && args.trim().length > 0) {
    await handleShelterSearch(client, db, chatId, args.trim());
  } else {
    await setSession(db, telegramId, chatId, "shl_search", {});
    await client.sendMessage(
      chatId,
      "⛺ <b>Estado de Refugio</b>\n\nEscribe el <b>nombre del refugio</b> que quieres actualizar (o al menos una parte del nombre):\n\n<i>/cancelar para salir.</i>"
    );
  }
}

export async function handleShelterState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string
): Promise<void> {
  const currentStep = session.step;

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Actualización cancelada.");
    return;
  }

  if (currentStep === "shl_search") {
    if (!text || text.trim().length < 3) {
      await client.sendMessage(chatId, "⚠️ Nombre muy corto. Escribe al menos 3 letras:");
      return;
    }
    
    await clearSession(db, telegramId);
    await handleShelterSearch(client, db, chatId, text.trim());
  }
}

async function handleShelterSearch(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  query: string
): Promise<void> {
  const { results } = await db
    .prepare("SELECT id, nombre FROM refugios WHERE nombre LIKE ? LIMIT 10")
    .bind(`%${query}%`)
    .all<{ id: number; nombre: string }>();

  if (!results || results.length === 0) {
    await client.sendMessage(chatId, "❌ No encontré ningún refugio con ese nombre. Intenta de nuevo con /refugio.");
    return;
  }

  const inlineKeyboard = results.map((r) => [
    { text: `⛺ ${r.nombre}`, callback_data: `shl_sel:${r.id}` },
  ]);

  await client.sendMessage(chatId, "Selecciona el refugio:", {
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

export async function handleShelterSelection(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  refugioId: string,
  messageId?: number
): Promise<void> {
  const r = await db
    .prepare("SELECT nombre, capacidad_maxima, ocupacion_actual FROM refugios WHERE id = ?")
    .bind(refugioId)
    .first<{ nombre: string; capacidad_maxima: number; ocupacion_actual: number }>();

  if (!r) {
    await client.sendMessage(chatId, "❌ Error: Refugio no encontrado.");
    return;
  }

  const porcentaje = r.capacidad_maxima > 0 ? Math.round((r.ocupacion_actual / r.capacidad_maxima) * 100) : 0;
  
  const text = `⛺ <b>${r.nombre}</b>\n\nCapacidad Máxima: ${r.capacidad_maxima}\nOcupación Actual: ${r.ocupacion_actual} (${porcentaje}%)\n\n¿Cuál es el estado actual?`;

  const inlineKeyboard = [
    [{ text: "🟢 Disponible (25%)", callback_data: `shl_sta:${refugioId}:25` }],
    [{ text: "🟡 Casi Lleno (75%)", callback_data: `shl_sta:${refugioId}:75` }],
    [{ text: "🔴 Lleno (100%)", callback_data: `shl_sta:${refugioId}:100` }],
  ];

  if (messageId) {
    await client.editMessageText(chatId, messageId, text, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } else {
    await client.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }
}

export async function handleShelterStatusUpdate(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  refugioId: string,
  porcentaje: number,
  messageId?: number
): Promise<void> {
  const r = await db
    .prepare("SELECT nombre, capacidad_maxima FROM refugios WHERE id = ?")
    .bind(refugioId)
    .first<{ nombre: string; capacidad_maxima: number }>();

  if (!r) return;

  const nuevaOcupacion = Math.round((r.capacidad_maxima * porcentaje) / 100);

  await db
    .prepare("UPDATE refugios SET ocupacion_actual = ?, updated_at = datetime('now', '-4 hours') WHERE id = ?")
    .bind(nuevaOcupacion, refugioId)
    .run();

  const voluntario = await db.prepare("SELECT id FROM voluntarios WHERE telegram_id = ?").bind(String(telegramId)).first<{id: number}>();
  if (voluntario) {
    await db.prepare(`
      UPDATE refugios SET updated_by = ? WHERE id = ?
    `).bind(voluntario.id, refugioId).run();

    await db.prepare(`
      INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
      VALUES (?, 'EDITAR', 'refugios', ?, datetime('now', '-4 hours'))
    `).bind(voluntario.id, refugioId).run();
  }

  const text = `✅ <b>${r.nombre}</b> actualizado.\n\nNueva ocupación estimada: <b>${nuevaOcupacion}</b> personas (${porcentaje}%).`;

  if (messageId) {
    await client.editMessageText(chatId, messageId, text, {});
  } else {
    await client.sendMessage(chatId, text);
  }
}
