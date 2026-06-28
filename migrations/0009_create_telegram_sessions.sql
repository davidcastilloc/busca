-- Migración 0009: Crear tabla de sesiones de telegram
CREATE TABLE telegram_sessions (
  telegram_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  step TEXT NOT NULL,
  data TEXT, -- JSON con datos temporales del flujo
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_telegram_sessions_step ON telegram_sessions(step);
