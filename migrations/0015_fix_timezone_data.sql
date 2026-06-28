PRAGMA defer_foreign_keys = on;

-- Actualizar datos existentes a UTC de Caracas
UPDATE personas SET created_at = datetime(created_at, '-4 hours'), updated_at = datetime(updated_at, '-4 hours');
UPDATE reportes SET created_at = datetime(created_at, '-4 hours'), updated_at = datetime(updated_at, '-4 hours');
UPDATE flyers SET created_at = datetime(created_at, '-4 hours'), updated_at = datetime(updated_at, '-4 hours');
UPDATE push_subscriptions SET created_at = datetime(created_at, '-4 hours');
UPDATE refugios SET created_at = datetime(created_at, '-4 hours'), updated_at = datetime(updated_at, '-4 hours'), fecha_registro = datetime(fecha_registro, '-4 hours');
UPDATE telegram_sessions SET updated_at = datetime(updated_at, '-4 hours');
UPDATE voluntarios SET created_at = datetime(created_at, '-4 hours');
UPDATE sesiones_voluntarios SET created_at = datetime(created_at, '-4 hours');
UPDATE historial_actividad SET created_at = datetime(created_at, '-4 hours');;
