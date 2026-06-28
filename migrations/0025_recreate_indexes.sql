PRAGMA defer_foreign_keys = on;

CREATE INDEX idx_personas_cedula ON personas(cedula);
CREATE INDEX idx_personas_nombre ON personas(nombre, apellido);
CREATE INDEX idx_personas_estado ON personas(estado);
CREATE INDEX idx_personas_ubicacion ON personas(ubicacion_nombre);
CREATE INDEX idx_reportes_tipo ON reportes(tipo);
CREATE INDEX idx_reportes_nombre ON reportes(nombre_buscado);
CREATE INDEX idx_reportes_cedula ON reportes(cedula_buscado);
CREATE INDEX idx_reportes_estado ON reportes(estado_reporte);
CREATE INDEX idx_flyers_created_at ON flyers(created_at);
CREATE INDEX idx_personas_verificacion ON personas(verificacion);
CREATE INDEX idx_reportes_verificacion ON reportes(verificacion);
CREATE INDEX idx_push_rol ON push_subscriptions(rol);
CREATE INDEX idx_push_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_telegram_sessions_step ON telegram_sessions(step);
CREATE UNIQUE INDEX idx_voluntarios_telegram_id ON voluntarios(telegram_id);
CREATE INDEX idx_personas_refugio_id ON personas(refugio_id);
CREATE INDEX idx_reportes_refugio_id ON reportes(refugio_id);
CREATE INDEX idx_reportes_cedula_tipo_estado ON reportes(cedula_buscado, tipo, estado_reporte);
CREATE INDEX idx_sesiones_voluntario_id ON sesiones_voluntarios(voluntario_id);
CREATE INDEX idx_flyers_tipo ON flyers(tipo);
CREATE INDEX idx_historial_actividad_voluntario ON historial_actividad(voluntario_id);
CREATE INDEX idx_historial_actividad_tabla_registro ON historial_actividad(tabla, registro_id);

