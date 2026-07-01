PRAGMA defer_foreign_keys = ON;

CREATE TABLE personas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula TEXT UNIQUE,
  nombre TEXT NOT NULL,
  apellido TEXT,
  edad INTEGER,
  sexo TEXT CHECK(sexo IN ('M','F','X')),
  estado TEXT CHECK(estado IN ('desaparecido','afectado','herido','localizado','fallecido')) DEFAULT 'desaparecido',
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
  CASE WHEN estado = 'desconocido' THEN 'desaparecido' ELSE estado END,
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
