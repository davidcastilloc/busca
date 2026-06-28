-- Migración 0011: Agregar índices adicionales para optimizar búsquedas frecuentes e integraciones
CREATE INDEX IF NOT EXISTS idx_personas_refugio_id ON personas(refugio_id);
CREATE INDEX IF NOT EXISTS idx_reportes_refugio_id ON reportes(refugio_id);
CREATE INDEX IF NOT EXISTS idx_reportes_cedula_tipo_estado ON reportes(cedula_buscado, tipo, estado_reporte);
CREATE INDEX IF NOT EXISTS idx_sesiones_voluntario_id ON sesiones_voluntarios(voluntario_id);
