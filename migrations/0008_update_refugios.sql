-- Migración 0008: Agregar soporte para centros unificados, demografía detallada e inventario
ALTER TABLE refugios ADD COLUMN tipo TEXT CHECK(tipo IN ('hospital', 'centro_acopio', 'refugio')) DEFAULT 'refugio';
ALTER TABLE refugios ADD COLUMN encargado TEXT;
ALTER TABLE refugios ADD COLUMN ninos INTEGER DEFAULT 0;
ALTER TABLE refugios ADD COLUMN bebes_lactantes INTEGER DEFAULT 0;
ALTER TABLE refugios ADD COLUMN adultos_mayores INTEGER DEFAULT 0;
ALTER TABLE refugios ADD COLUMN personal_profesional INTEGER DEFAULT 0;
ALTER TABLE refugios ADD COLUMN voluntarios INTEGER DEFAULT 0;
ALTER TABLE refugios ADD COLUMN inventario TEXT; -- Guardará el JSON del inventario
ALTER TABLE refugios ADD COLUMN fecha_registro TEXT; -- Fecha/Hora del registro
