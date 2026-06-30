-- Migración 0024: Agregar refugio_id a la tabla personas
ALTER TABLE personas ADD COLUMN refugio_id INTEGER REFERENCES refugios(id);
