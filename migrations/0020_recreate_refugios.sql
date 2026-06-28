PRAGMA defer_foreign_keys = on;

-- Recrear tabla refugios para actualizar DEFAULT
CREATE TABLE new_refugios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  direccion TEXT,
  latitud REAL NOT NULL,
  longitud REAL NOT NULL,
  capacidad_maxima INTEGER DEFAULT 100,
  ocupacion_actual INTEGER DEFAULT 0,
  necesidades TEXT,
  contacto TEXT,
  created_at DATETIME DEFAULT (datetime('now', '-4 hours')),
  updated_at DATETIME DEFAULT (datetime('now', '-4 hours'))
, tipo TEXT CHECK(tipo IN ('hospital', 'centro_acopio', 'refugio')) DEFAULT 'refugio', encargado TEXT, ninos INTEGER DEFAULT 0, bebes_lactantes INTEGER DEFAULT 0, adultos_mayores INTEGER DEFAULT 0, personal_profesional INTEGER DEFAULT 0, voluntarios INTEGER DEFAULT 0, inventario TEXT, fecha_registro TEXT, fotos TEXT, created_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES voluntarios(id) ON DELETE SET NULL);
INSERT INTO new_refugios SELECT * FROM refugios;
DROP TABLE refugios;
ALTER TABLE new_refugios RENAME TO refugios;
