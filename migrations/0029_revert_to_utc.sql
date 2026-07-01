-- Revert VET to UTC
UPDATE personas SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours') WHERE 1=1;
UPDATE reportes SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours') WHERE 1=1;
UPDATE flyers SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours') WHERE 1=1;
UPDATE push_subscriptions SET created_at = datetime(created_at, '+4 hours') WHERE 1=1;
UPDATE refugios SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours'), fecha_registro = datetime(fecha_registro, '+4 hours') WHERE 1=1;
UPDATE telegram_sessions SET updated_at = datetime(updated_at, '+4 hours') WHERE 1=1;
UPDATE voluntarios SET created_at = datetime(created_at, '+4 hours') WHERE 1=1;
UPDATE sesiones_voluntarios SET created_at = datetime(created_at, '+4 hours') WHERE 1=1;
UPDATE historial_actividad SET created_at = datetime(created_at, '+4 hours') WHERE 1=1;
UPDATE necesidades SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours') WHERE 1=1;
UPDATE centros_acopio SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours'), fecha_registro = datetime(fecha_registro, '+4 hours') WHERE 1=1;
UPDATE hospitales SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours'), fecha_registro = datetime(fecha_registro, '+4 hours') WHERE 1=1;
UPDATE refugios_temporales SET created_at = datetime(created_at, '+4 hours'), updated_at = datetime(updated_at, '+4 hours'), fecha_registro = datetime(fecha_registro, '+4 hours') WHERE 1=1;
