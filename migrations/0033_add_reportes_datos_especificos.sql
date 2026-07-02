-- Migración 0033: Agregar columna datos_especificos para estructuración JSON de reportes
ALTER TABLE reportes ADD COLUMN datos_especificos TEXT;
ALTER TABLE reportes ADD COLUMN necesidad_id INTEGER;
ALTER TABLE personas ADD COLUMN created_by INTEGER;
ALTER TABLE personas ADD COLUMN updated_by INTEGER;
