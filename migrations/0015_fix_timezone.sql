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
UPDATE historial_actividad SET created_at = datetime(created_at, '-4 hours');

-- Recrear tabla personas para actualizar DEFAULT
CREATE TABLE new_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT,
  edad INTEGER,
  sexo TEXT CHECK(sexo IN ('M','F','X')),
  estado TEXT CHECK(estado IN ('vivo','herido','fallecido','desconocido')) DEFAULT 'desconocido',
  ubicacion_nombre TEXT,
  latitud REAL,
  longitud REAL,
  refugio TEXT,
  contacto TEXT,
  notas TEXT,
  foto_key TEXT,
  fuente TEXT DEFAULT 'web',
  created_at TEXT DEFAULT (datetime('now', '-4 hours')),
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
, verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna', foto_evidencia_key TEXT, contacto_evidencia TEXT, notas_evidencia TEXT, refugio_id INTEGER);
INSERT INTO new_personas SELECT * FROM personas;
DROP TABLE personas;
ALTER TABLE new_personas RENAME TO personas;

-- Recrear tabla reportes para actualizar DEFAULT
CREATE TABLE new_reportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT CHECK(tipo IN ('desaparecido','encontrado','refugio','necesidad')) NOT NULL,
  nombre_buscado TEXT,
  cedula_buscado TEXT,
  descripcion TEXT NOT NULL,
  reportante_nombre TEXT,
  reportante_contacto TEXT,
  ubicacion_nombre TEXT,
  latitud REAL,
  longitud REAL,
  foto_key TEXT,
  estado_reporte TEXT CHECK(estado_reporte IN ('abierto','resuelto','archivado')) DEFAULT 'abierto',
  persona_id INTEGER REFERENCES personas(id),
  created_at TEXT DEFAULT (datetime('now', '-4 hours')),
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
, verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna', foto_evidencia_key TEXT, contacto_evidencia TEXT, notas_evidencia TEXT, refugio_id INTEGER, created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL);
INSERT INTO new_reportes SELECT * FROM reportes;
DROP TABLE reportes;
ALTER TABLE new_reportes RENAME TO reportes;

-- Recrear tabla flyers para actualizar DEFAULT
CREATE TABLE new_flyers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  foto_key TEXT NOT NULL,
  phones TEXT,
  socials TEXT,
  created_at TEXT DEFAULT (datetime('now', '-4 hours')),
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
, tipo TEXT DEFAULT 'desaparecido');
INSERT INTO new_flyers SELECT * FROM flyers;
DROP TABLE flyers;
ALTER TABLE new_flyers RENAME TO flyers;

-- Recrear tabla push_subscriptions para actualizar DEFAULT
CREATE TABLE new_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  rol TEXT DEFAULT 'voluntario' CHECK(rol IN ('voluntario', 'admin', 'familiar')),
  created_at TEXT DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_push_subscriptions SELECT * FROM push_subscriptions;
DROP TABLE push_subscriptions;
ALTER TABLE new_push_subscriptions RENAME TO push_subscriptions;

-- Recrear tabla refugios para actualizar DEFAULT
CREATE TABLE new_refugios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  capacidad_maxima INTEGER DEFAULT 100,
  ocupacion_actual INTEGER DEFAULT 0,
  necesidades TEXT,
  contacto TEXT,
  created_at DATETIME DEFAULT (datetime('now', '-4 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '-4 hours'))
, tipo TEXT CHECK(tipo IN ('hospital', 'centro_acopio', 'refugio')) DEFAULT 'refugio', encargado TEXT, ninos INTEGER DEFAULT 0, bebes_lactantes INTEGER DEFAULT 0, adultos_mayores INTEGER DEFAULT 0, personal_profesional INTEGER DEFAULT 0, voluntarios INTEGER DEFAULT 0, inventario TEXT, fecha_registro TEXT, fotos TEXT, created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL);
INSERT INTO new_refugios SELECT * FROM refugios;
DROP TABLE refugios;
ALTER TABLE new_refugios RENAME TO refugios;

-- Recrear tabla telegram_sessions para actualizar DEFAULT
CREATE TABLE new_telegram_sessions (
  telegram_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  step TEXT NOT NULL,
  data TEXT, -- JSON con datos temporales del flujo
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_telegram_sessions SELECT * FROM telegram_sessions;
DROP TABLE telegram_sessions;
ALTER TABLE new_telegram_sessions RENAME TO telegram_sessions;

-- Recrear tabla voluntarios para actualizar DEFAULT
CREATE TABLE new_voluntarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL, -- SHA-256 hash del PIN
  activo INTEGER DEFAULT 1, -- 1 activo, 0 desactivado
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
, telegram_id TEXT);
INSERT INTO new_voluntarios SELECT * FROM voluntarios;
DROP TABLE voluntarios;
ALTER TABLE new_voluntarios RENAME TO voluntarios;

-- Recrear tabla sesiones_voluntarios para actualizar DEFAULT
CREATE TABLE new_sesiones_voluntarios (
  token TEXT PRIMARY KEY,
  voluntario_id INTEGER NOT NULL REFERENCES voluntarios(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_sesiones_voluntarios SELECT * FROM sesiones_voluntarios;
DROP TABLE sesiones_voluntarios;
ALTER TABLE new_sesiones_voluntarios RENAME TO sesiones_voluntarios;

-- Recrear tabla historial_actividad para actualizar DEFAULT
CREATE TABLE new_historial_actividad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voluntario_id INTEGER REFERENCES voluntarios(id) ON DELETE CASCADE,
  accion TEXT NOT NULL, -- 'CREAR', 'EDITAR', 'BORRAR'
  tabla TEXT NOT NULL, -- 'refugios', 'reportes', etc.
  registro_id INTEGER NOT NULL,
  detalles TEXT, -- JSON con info extra si es necesaria
  created_at DATETIME DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_historial_actividad SELECT * FROM historial_actividad;
DROP TABLE historial_actividad;
ALTER TABLE new_historial_actividad RENAME TO historial_actividad;

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
