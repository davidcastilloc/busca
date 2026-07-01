-- Indices para queries ordenados por fecha
CREATE INDEX IF NOT EXISTS idx_personas_updated_at ON personas (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_updated_at ON reportes (updated_at DESC);

-- Indice para filtrar reportes por tipo y estado
CREATE INDEX IF NOT EXISTS idx_reportes_tipo_estado ON reportes (tipo, estado_reporte);
