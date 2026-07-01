-- Recrear el índice idx_personas_updated_at que se perdió al renombrar la tabla en la migración 0030
CREATE INDEX IF NOT EXISTS idx_personas_updated_at ON personas (updated_at DESC);
