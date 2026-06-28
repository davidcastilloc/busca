PRAGMA defer_foreign_keys = on;

-- Recrear tabla flyers para actualizar DEFAULT
CREATE TABLE new_flyers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  foto_key TEXT NOT NULL,
  phones TEXT,
  socials TEXT,
  created_at TEXT DEFAULT (datetime('now', '-4 hours')),
  updated_at TEXT DEFAULT (datetime('now', '-4 hours'))
, tipo TEXT DEFAULT 'desaparecido');
INSERT INTO new_flyers SELECT * FROM flyers;
DROP TABLE flyers;
ALTER TABLE new_flyers RENAME TO flyers;
