-- Migración 0003: Crear tabla de flyers
CREATE TABLE flyers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  foto_key TEXT NOT NULL,
  phones TEXT,
  socials TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_flyers_created_at ON flyers(created_at);
