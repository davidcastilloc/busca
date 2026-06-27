-- Migración 0006: Crear tabla de suscripciones Push
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  rol TEXT DEFAULT 'voluntario' CHECK(rol IN ('voluntario', 'admin', 'familiar')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_push_rol ON push_subscriptions(rol);
CREATE INDEX idx_push_endpoint ON push_subscriptions(endpoint);
