-- Restaurar columnas que se perdieron en la migración 0030 de recreación de la tabla personas
ALTER TABLE personas ADD COLUMN hospital_id INTEGER REFERENCES hospitales(id);
ALTER TABLE personas ADD COLUMN centro_acopio_id INTEGER REFERENCES centros_acopio(id);
ALTER TABLE personas ADD COLUMN refugio_id INTEGER REFERENCES refugios(id);
