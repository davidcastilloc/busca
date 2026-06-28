PRAGMA defer_foreign_keys = on;

-- Recrear tabla historial_actividad para actualizar DEFAULT
CREATE TABLE new_historial_actividad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voluntario_id INTEGER REFERENCES voluntarios(id) ON DELETE CASCADE,
  accion TEXT NOT NULL, -- 'CREAR', 'EDITAR', 'BORRAR'
  tabla TEXT NOT NULL, -- 'refugios', 'reportes', etc.
  registro_id INTEGER NOT NULL,
  detalles TEXT, -- JSON con info extra si es necesaria
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_historial_actividad SELECT * FROM historial_actividad;
DROP TABLE historial_actividad;
ALTER TABLE new_historial_actividad RENAME TO historial_actividad;
