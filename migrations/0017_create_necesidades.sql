-- Migración 0017: Crear tabla de necesidades y separar de reportes
CREATE TABLE necesidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  gravedad TEXT NOT NULL,
  afectados INTEGER,
  descripcion TEXT NOT NULL,
  ubicacion_nombre TEXT,
  latitud REAL,
  longitud REAL,
  telefono TEXT,
  foto_key TEXT,
  refugio_id INTEGER REFERENCES refugios(id),
  estado TEXT CHECK(estado IN ('abierta', 'atendida', 'cancelada')) DEFAULT 'abierta',
  reportante_nombre TEXT,
  reportante_contacto TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_necesidades_estado ON necesidades(estado);
CREATE INDEX idx_necesidades_categoria ON necesidades(categoria);

-- Migrar datos básicos (extrayendo lo básico para no hacer un script tan complejo)
INSERT INTO necesidades (
  descripcion,
  categoria,
  gravedad,
  ubicacion_nombre,
  latitud,
  longitud,
  foto_key,
  reportante_nombre,
  reportante_contacto,
  refugio_id,
  created_at,
  updated_at
)
SELECT
  descripcion,
  'Migrado',
  'Media (Urgente)',
  ubicacion_nombre,
  latitud,
  longitud,
  foto_key,
  reportante_nombre,
  reportante_contacto,
  NULL, -- refugio id lo ignoramos en migracion porque no estaba como foreing en reportes
  created_at,
  updated_at
FROM reportes
WHERE tipo = 'necesidad';

-- Eliminar los reportes viejos para no tener duplicados en búsquedas (se usa Delete CASCADE virtualmente si hubieran foraneas, pero no)
DELETE FROM reportes WHERE tipo = 'necesidad';
