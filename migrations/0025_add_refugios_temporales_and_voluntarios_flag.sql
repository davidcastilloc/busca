-- Migración 0025: Agregar refugios temporales y bandera requiere_voluntarios

CREATE TABLE refugios_temporales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  contacto TEXT,
  necesidades TEXT,
  inventario TEXT,
  encargado TEXT,
  fotos TEXT,
  requiere_voluntarios INTEGER DEFAULT 0,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL
);

ALTER TABLE refugios ADD COLUMN requiere_voluntarios INTEGER DEFAULT 0;
ALTER TABLE hospitales ADD COLUMN requiere_voluntarios INTEGER DEFAULT 0;
ALTER TABLE centros_acopio ADD COLUMN requiere_voluntarios INTEGER DEFAULT 0;

ALTER TABLE personas ADD COLUMN refugio_temporal_id INTEGER REFERENCES refugios_temporales(id);
ALTER TABLE reportes ADD COLUMN refugio_temporal_id INTEGER REFERENCES refugios_temporales(id);
ALTER TABLE necesidades ADD COLUMN refugio_temporal_id INTEGER REFERENCES refugios_temporales(id);
