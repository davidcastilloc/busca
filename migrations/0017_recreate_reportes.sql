PRAGMA defer_foreign_keys = on;

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
