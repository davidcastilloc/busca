-- Migración 0022: Agregar centro_acopio_id a personas y reportes
ALTER TABLE personas ADD COLUMN centro_acopio_id INTEGER REFERENCES centros_acopio(id);
ALTER TABLE reportes ADD COLUMN centro_acopio_id INTEGER REFERENCES centros_acopio(id);
