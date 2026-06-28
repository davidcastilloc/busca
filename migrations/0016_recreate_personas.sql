PRAGMA defer_foreign_keys = on;

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
