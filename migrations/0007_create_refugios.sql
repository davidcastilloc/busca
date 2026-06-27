-- Migración 0007: Creación de la tabla de refugios
CREATE TABLE refugios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  capacidad_maxima INTEGER DEFAULT 100,
  ocupacion_actual INTEGER DEFAULT 0,
  necesidades TEXT,
  contacto TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE personas ADD COLUMN refugio_id INTEGER;
ALTER TABLE reportes ADD COLUMN refugio_id INTEGER;
