import { execSync } from 'child_process';

// Configuración
const DB_NAME = 'busca-db';
const BATCH_SIZE = 500;

function runQuery(query) {
  try {
    const cmd = `npx wrangler d1 execute ${DB_NAME} --remote --command="${query}" --json`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return JSON.parse(output);
  } catch (error) {
    console.error(`Error ejecutando query: ${query}`);
    throw error;
  }
}

async function migrate() {
  console.log("🚀 Iniciando migración por lotes en D1 Remoto...");

  // 1. Crear la tabla temporal
  console.log("1️⃣ Creando tabla temporal (personas_new)...");
  runQuery(`
    CREATE TABLE IF NOT EXISTS personas_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula TEXT UNIQUE,
      nombre TEXT NOT NULL,
      apellido TEXT,
      edad INTEGER,
      sexo TEXT CHECK(sexo IN ('M','F','X')),
      estado TEXT CHECK(estado IN ('desaparecido','afectado','herido','localizado','fallecido')) DEFAULT 'desaparecido',
      ubicacion_nombre TEXT,
      latitud REAL,
      longitud REAL,
      refugio TEXT,
      contacto TEXT,
      notas TEXT,
      foto_key TEXT,
      fuente TEXT DEFAULT 'web',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      verificacion TEXT CHECK(verificacion IN ('ninguna', 'pendiente', 'verificado')) DEFAULT 'ninguna',
      foto_evidencia_key TEXT,
      contacto_evidencia TEXT,
      notas_evidencia TEXT
    );
  `);

  // 2. Limpiar tabla temporal por si falló antes
  console.log("🧹 Limpiando tabla temporal por si hubo intentos previos...");
  runQuery(`DELETE FROM personas_new;`);

  // 3. Contar total de registros en producción
  console.log("📊 Contando registros totales...");
  const countResult = runQuery(`SELECT COUNT(*) as total FROM personas;`);
  const total = countResult[0].results[0].total;
  console.log(`Total a migrar: ${total} personas.`);

  // 4. Migrar por lotes
  console.log("⏳ Iniciando transferencia de datos...");
  let offset = 0;
  while (offset < total) {
    console.log(`Migrando lote: ${offset} a ${Math.min(offset + BATCH_SIZE, total)}...`);
    const insertQuery = `
      INSERT INTO personas_new 
      SELECT id, cedula, nombre, apellido, edad, sexo, 
             CASE WHEN estado = 'desconocido' THEN 'desaparecido' ELSE estado END,
             ubicacion_nombre, latitud, longitud, refugio, contacto, notas, foto_key, fuente, created_at, updated_at,
             verificacion, foto_evidencia_key, contacto_evidencia, notas_evidencia
      FROM personas 
      LIMIT ${BATCH_SIZE} OFFSET ${offset};
    `;
    runQuery(insertQuery);
    offset += BATCH_SIZE;
  }

  // 5. Swap de tablas
  console.log("🔄 Realizando el swap de tablas...");
  runQuery(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE personas;
    ALTER TABLE personas_new RENAME TO personas;
    PRAGMA foreign_keys = ON;
  `);

  console.log("🔄 Creando índices (uno por uno para evitar límite de CPU)...");
  runQuery(`CREATE INDEX IF NOT EXISTS idx_personas_cedula ON personas(cedula);`);
  runQuery(`CREATE INDEX IF NOT EXISTS idx_personas_nombre ON personas(nombre, apellido);`);
  runQuery(`CREATE INDEX IF NOT EXISTS idx_personas_estado ON personas(estado);`);
  runQuery(`CREATE INDEX IF NOT EXISTS idx_personas_ubicacion ON personas(ubicacion_nombre);`);
  runQuery(`CREATE INDEX IF NOT EXISTS idx_personas_verificacion ON personas(verificacion);`);

  console.log("✅ ¡Migración completada con éxito en remoto!");
}

migrate().catch(console.error);
