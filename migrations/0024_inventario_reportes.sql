-- Migración 0024: Crear tabla de reportes históricos de inventario para consenso ponderado
CREATE TABLE inventario_reportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  centro_id INTEGER NOT NULL,
  centro_tipo TEXT CHECK(centro_tipo IN ('refugio', 'centro_acopio')) NOT NULL,
  item_id TEXT NOT NULL,
  estado_valor REAL NOT NULL, -- Mapeo numérico: Critico (-2.0), Bajo (-1.0), Estable (1.0), Exceso (2.0)
  voluntario_id INTEGER,
  created_at INTEGER NOT NULL -- Timestamp UNIX original
);

CREATE INDEX idx_inv_reportes_centro_item ON inventario_reportes(centro_id, item_id, created_at);
