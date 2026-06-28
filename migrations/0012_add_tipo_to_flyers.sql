-- Migración 0012: Agregar columna tipo a flyers
-- Permite distinguir el tipo de reporte en la página del flyer
-- para generar mensajes de compartir adaptados por tipo
ALTER TABLE flyers ADD COLUMN tipo TEXT DEFAULT 'desaparecido';

-- Índice para filtrar por tipo si se necesita en el futuro
CREATE INDEX idx_flyers_tipo ON flyers(tipo);
