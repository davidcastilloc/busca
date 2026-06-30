-- Migración 0023: Agregar centro_acopio_id y hospital_id a ayudas_en_camino
ALTER TABLE ayudas_en_camino ADD COLUMN centro_acopio_id INTEGER REFERENCES centros_acopio(id);
ALTER TABLE ayudas_en_camino ADD COLUMN hospital_id INTEGER REFERENCES hospitales(id);
