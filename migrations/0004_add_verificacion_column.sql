-- Migración 0004: Agregar columnas de verificación y evidencia a personas
ALTER TABLE personas ADD COLUMN verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna';
ALTER TABLE personas ADD COLUMN foto_evidencia_key TEXT;
ALTER TABLE personas ADD COLUMN contacto_evidencia TEXT;
ALTER TABLE personas ADD COLUMN notas_evidencia TEXT;

CREATE INDEX idx_personas_verificacion ON personas(verificacion);
