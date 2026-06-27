-- Migración 0009: Tablas de voluntarios y sesiones
CREATE TABLE voluntarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL, -- SHA-256 hash del PIN
  activo INTEGER DEFAULT 1, -- 1 activo, 0 desactivado
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sesiones_voluntarios (
  token TEXT PRIMARY KEY,
  voluntario_id INTEGER NOT NULL REFERENCES voluntarios(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
