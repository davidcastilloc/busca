PRAGMA defer_foreign_keys = on;

-- Recrear tabla voluntarios para actualizar DEFAULT
CREATE TABLE new_voluntarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL, -- SHA-256 hash del PIN
  activo INTEGER DEFAULT 1, -- 1 activo, 0 desactivado
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
, telegram_id TEXT);
INSERT INTO new_voluntarios SELECT * FROM voluntarios;
DROP TABLE voluntarios;
ALTER TABLE new_voluntarios RENAME TO voluntarios;
