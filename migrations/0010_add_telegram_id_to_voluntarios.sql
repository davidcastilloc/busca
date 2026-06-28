-- Agregar columna telegram_id a voluntarios
ALTER TABLE voluntarios ADD COLUMN telegram_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_voluntarios_telegram_id ON voluntarios(telegram_id);
