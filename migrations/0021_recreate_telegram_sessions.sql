PRAGMA defer_foreign_keys = on;

-- Recrear tabla telegram_sessions para actualizar DEFAULT
CREATE TABLE new_telegram_sessions (
  telegram_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  step TEXT NOT NULL,
  data TEXT, -- JSON con datos temporales del flujo
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_telegram_sessions SELECT * FROM telegram_sessions;
DROP TABLE telegram_sessions;
ALTER TABLE new_telegram_sessions RENAME TO telegram_sessions;
