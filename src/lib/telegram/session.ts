export interface TelegramSession {
  telegram_id: string;
  chat_id: string;
  step: string;
  data: any;
}

export async function getSession(db: D1Database, telegramId: string | number): Promise<TelegramSession | null> {
  try {
    const row = await db
      .prepare("SELECT * FROM telegram_sessions WHERE telegram_id = ?")
      .bind(String(telegramId))
      .first<any>();

    if (!row) return null;

    let parsedData = {};
    if (row.data) {
      try {
        parsedData = JSON.parse(row.data);
      } catch (e) {
        console.error("Error parsing session data JSON:", e);
      }
    }

    return {
      telegram_id: row.telegram_id,
      chat_id: row.chat_id,
      step: row.step,
      data: parsedData,
    };
  } catch (error) {
    console.error("D1 getSession error:", error);
    return null;
  }
}

export async function setSession(
  db: D1Database,
  telegramId: string | number,
  chatId: string | number,
  step: string,
  data: any
): Promise<void> {
  try {
    const dataStr = JSON.stringify(data || {});
    await db
      .prepare(
        `INSERT INTO telegram_sessions (telegram_id, chat_id, step, data, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(telegram_id) DO UPDATE SET
           step = ?3,
           data = ?4,
           updated_at = datetime('now')`
      )
      .bind(String(telegramId), String(chatId), step, dataStr)
      .run();
  } catch (error) {
    console.error("D1 setSession error:", error);
  }
}

export async function clearSession(db: D1Database, telegramId: string | number): Promise<void> {
  try {
    await db
      .prepare("DELETE FROM telegram_sessions WHERE telegram_id = ?")
      .bind(String(telegramId))
      .run();
  } catch (error) {
    console.error("D1 clearSession error:", error);
  }
}
