-- Migración 0001: Crear tabla de personas
CREATE TABLE personas (
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_personas_cedula ON personas(cedula);
CREATE INDEX idx_personas_nombre ON personas(nombre, apellido);
CREATE INDEX idx_personas_estado ON personas(estado);
CREATE INDEX idx_personas_ubicacion ON personas(ubicacion_nombre);
