-- Migración 0018: Agregar trazabilidad a la tabla personas
ALTER TABLE personas ADD COLUMN created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;
ALTER TABLE personas ADD COLUMN updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL;
