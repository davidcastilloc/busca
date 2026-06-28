-- Migración 0014: Trazabilidad y auditoría de voluntarios

ALTER TABLE refugios ADD COLUMN created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;
ALTER TABLE refugios ADD COLUMN updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;

ALTER TABLE reportes ADD COLUMN created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;
ALTER TABLE reportes ADD COLUMN updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;

CREATE TABLE historial_actividad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voluntario_id INTEGER REFERENCES voluntarios(id) ON DELETE CASCADE,
  accion TEXT NOT NULL, -- 'CREAR', 'EDITAR', 'BORRAR'
  tabla TEXT NOT NULL, -- 'refugios', 'reportes', etc.
  registro_id INTEGER NOT NULL,
  detalles TEXT, -- JSON con info extra si es necesaria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historial_actividad_voluntario ON historial_actividad(voluntario_id);
CREATE INDEX IF NOT EXISTS idx_historial_actividad_tabla_registro ON historial_actividad(tabla, registro_id);
