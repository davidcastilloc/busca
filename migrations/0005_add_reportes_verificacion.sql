-- Migración 0005: Agregar columnas de verificación y evidencia a reportes
ALTER TABLE reportes ADD COLUMN verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna';
ALTER TABLE reportes ADD COLUMN foto_evidencia_key TEXT;
ALTER TABLE reportes ADD COLUMN contacto_evidencia TEXT;
ALTER TABLE reportes ADD COLUMN notas_evidencia TEXT;

CREATE INDEX idx_reportes_verificacion ON reportes(verificacion);
