PRAGMA defer_foreign_keys = on;

-- Recrear tabla sesiones_voluntarios para actualizar DEFAULT
CREATE TABLE new_sesiones_voluntarios (
  token TEXT PRIMARY KEY,
  voluntario_id INTEGER NOT NULL REFERENCES voluntarios(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_sesiones_voluntarios SELECT * FROM sesiones_voluntarios;
DROP TABLE sesiones_voluntarios;
ALTER TABLE new_sesiones_voluntarios RENAME TO sesiones_voluntarios;
