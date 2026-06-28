-- Migración 0016: Cambiar estado 'vivo' a 'localizado'

-- 1. Crear reportes_temp SIN la restricción de foreign key a personas
CREATE TABLE reportes_temp (
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
  persona_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna',
  foto_evidencia_key TEXT,
  contacto_evidencia TEXT,
  notas_evidencia TEXT,
  refugio_id INTEGER,
  created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL
);

INSERT INTO reportes_temp SELECT * FROM reportes;
DROP TABLE reportes;

-- 2. Ahora que no hay dependencias, recrear personas
CREATE TABLE personas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT,
  edad INTEGER,
  sexo TEXT CHECK(sexo IN ('M','F','X')),
  estado TEXT CHECK(estado IN ('localizado','herido','fallecido','desconocido')) DEFAULT 'desconocido',
  ubicacion_nombre TEXT,
  latitud REAL,
  longitud REAL,
  refugio TEXT,
  contacto TEXT,
  notas TEXT,
  foto_key TEXT,
  fuente TEXT DEFAULT 'web',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna',
  foto_evidencia_key TEXT,
  contacto_evidencia TEXT,
  notas_evidencia TEXT
);

INSERT INTO personas_new SELECT 
  id, cedula, nombre, apellido, edad, sexo, 
  CASE WHEN estado = 'vivo' THEN 'localizado' ELSE estado END,
  ubicacion_nombre, latitud, longitud, refugio, contacto, notas, foto_key, fuente, created_at, updated_at,
  verificacion, foto_evidencia_key, contacto_evidencia, notas_evidencia
FROM personas;

DROP TABLE personas;
ALTER TABLE personas_new RENAME TO personas;

CREATE INDEX idx_personas_cedula ON personas(cedula);
CREATE INDEX idx_personas_nombre ON personas(nombre, apellido);
CREATE INDEX idx_personas_estado ON personas(estado);
CREATE INDEX idx_personas_ubicacion ON personas(ubicacion_nombre);
CREATE INDEX idx_personas_verificacion ON personas(verificacion);

-- 3. Finalmente, recrear reportes CON la restricción de foreign key
CREATE TABLE reportes_new (
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna',
  foto_evidencia_key TEXT,
  contacto_evidencia TEXT,
  notas_evidencia TEXT,
  refugio_id INTEGER,
  created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL
);

INSERT INTO reportes_new SELECT * FROM reportes_temp;
DROP TABLE reportes_temp;
ALTER TABLE reportes_new RENAME TO reportes;

CREATE INDEX idx_reportes_tipo ON reportes(tipo);
CREATE INDEX idx_reportes_nombre ON reportes(nombre_buscado);
CREATE INDEX idx_reportes_cedula ON reportes(cedula_buscado);
CREATE INDEX idx_reportes_estado ON reportes(estado_reporte);
CREATE INDEX idx_reportes_verificacion ON reportes(verificacion);
