-- Migración 0019: Añadir rol a voluntarios
ALTER TABLE voluntarios ADD COLUMN rol TEXT DEFAULT 'general';
