PRAGMA defer_foreign_keys = on;

-- Recrear tabla push_subscriptions para actualizar DEFAULT
CREATE TABLE new_push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  rol TEXT DEFAULT 'voluntario' CHECK(rol IN ('voluntario', 'admin', 'familiar')),
  created_at TEXT DEFAULT (datetime('now', '-4 hours'))
);
INSERT INTO new_push_subscriptions SELECT * FROM push_subscriptions;
DROP TABLE push_subscriptions;
ALTER TABLE new_push_subscriptions RENAME TO push_subscriptions;
