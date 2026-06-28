-- Migración 0013: Agregar columna para guardar URLs/keys de fotos en formato JSON
ALTER TABLE refugios ADD COLUMN fotos TEXT;
