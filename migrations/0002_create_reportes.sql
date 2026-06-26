-- Migración 0002: Crear tabla de reportes
CREATE TABLE reportes (
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
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_reportes_tipo ON reportes(tipo);
CREATE INDEX idx_reportes_nombre ON reportes(nombre_buscado);
CREATE INDEX idx_reportes_cedula ON reportes(cedula_buscado);
CREATE INDEX idx_reportes_estado ON reportes(estado_reporte);
