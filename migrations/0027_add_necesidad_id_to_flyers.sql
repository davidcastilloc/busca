-- Migración 0027: Agregar relación de necesidad_id a flyers
ALTER TABLE flyers ADD COLUMN necesidad_id INTEGER REFERENCES necesidades(id);

CREATE INDEX idx_flyers_necesidad_id ON flyers(necesidad_id);
