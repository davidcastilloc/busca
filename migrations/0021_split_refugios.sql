-- Migración 0021: Separar centros de acopio y hospitales en sus propias tablas
CREATE TABLE centros_acopio (
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
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL
);

CREATE TABLE hospitales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  contacto TEXT,
  necesidades TEXT,
  fotos TEXT,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL
);

ALTER TABLE personas ADD COLUMN hospital_id INTEGER REFERENCES hospitales(id);
ALTER TABLE reportes ADD COLUMN hospital_id INTEGER REFERENCES hospitales(id);
ALTER TABLE necesidades ADD COLUMN centro_acopio_id INTEGER REFERENCES centros_acopio(id);
ALTER TABLE necesidades ADD COLUMN hospital_id INTEGER REFERENCES hospitales(id);

-- Migrar datos
INSERT INTO centros_acopio (nombre, direccion, latitud, longitud, contacto, necesidades, inventario, encargado, fotos, fecha_registro, created_at, updated_at, created_by, updated_by)
SELECT nombre, direccion, latitud, longitud, contacto, necesidades, inventario, encargado, fotos, fecha_registro, created_at, updated_at, created_by, updated_by
FROM refugios WHERE tipo = 'centro_acopio';

INSERT INTO hospitales (nombre, direccion, latitud, longitud, contacto, necesidades, fotos, fecha_registro, created_at, updated_at, created_by, updated_by)
SELECT nombre, direccion, latitud, longitud, contacto, necesidades, fotos, fecha_registro, created_at, updated_at, created_by, updated_by
FROM refugios WHERE tipo = 'hospital';

-- Limpiar la tabla de refugios
DELETE FROM refugios WHERE tipo IN ('centro_acopio', 'hospital');
