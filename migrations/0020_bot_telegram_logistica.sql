-- Migración 0020: Tablas para Bot de Telegram y Gestión Logística

CREATE TABLE zonas_peligro (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT,
    tipo_peligro TEXT NOT NULL,
    descripcion TEXT,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (cast(strftime('%s','now') as int))
);

CREATE TABLE ayudas_en_camino (
    id TEXT PRIMARY KEY,
    refugio_id INTEGER REFERENCES refugios(id),
    necesidad_id INTEGER REFERENCES necesidades(id),
    voluntarios_count INTEGER DEFAULT 1,
    estatus TEXT DEFAULT 'en_ruta',
    eta INTEGER,
    created_at INTEGER DEFAULT (cast(strftime('%s','now') as int))
);

CREATE TABLE alertas_suscripciones (
    telegram_chat_id TEXT PRIMARY KEY,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    radio_km REAL DEFAULT 10.0,
    activo INTEGER DEFAULT 1,
    last_active INTEGER NOT NULL
);
