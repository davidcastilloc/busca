import { MeiliSearch } from "meilisearch";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new MeiliSearch({
  host: "http://localhost:7700",
  apiKey: "vtb-search-key",
});

const INDEX_NAME = "personas";
const DATA_PATH = resolve(__dirname, "..", "data", "persons_full.json");

async function main() {
  const raw = readFileSync(DATA_PATH, "utf-8");
  const { persons } = JSON.parse(raw);

  const docs = persons.map((p, i) => ({
    id: p.id || `persona-${i}`,
    uuid: p.id,
    nombre_completo: [p.first_name, p.last_name].filter(Boolean).join(" "),
    nombre: p.first_name || "",
    apellido: p.last_name || "",
    cedula: p.national_id || "",
    edad: p.age,
    genero: p.gender || "",
    ultima_ubicacion: p.last_seen_location || "",
    descripcion: p.description || "",
    status: p.status,
    tiene_foto: !!p.photo_key,
    foto_key: p.photo_key || null,
    reportante: [p.reporter_name, p.reporter_phone, p.reporter_email]
      .filter(Boolean)
      .join(" | "),
    encontrado: p.status === "found",
    notas_hallazgo: p.found_notes || "",
    hospital: p.hospital_name || "",
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  console.log(`Preparados ${docs.length} documentos para indexar`);

  const task = await client.index(INDEX_NAME).addDocuments(docs, { primaryKey: "id" });
  console.log(`Tarea de indexación: ${task.taskUid}`);

  await waitForTask(task.taskUid);

  const stats = await client.index(INDEX_NAME).getStats();
  console.log(`Indexado: ${stats.numberOfDocuments} documentos`);

  await client.index(INDEX_NAME).updateSettings({
    searchableAttributes: [
      "nombre_completo",
      "nombre",
      "apellido",
      "cedula",
      "ultima_ubicacion",
      "descripcion",
      "notas_hallazgo",
      "hospital",
      "reportante",
    ],
    filterableAttributes: ["status", "genero", "edad", "encontrado", "tiene_foto"],
    sortableAttributes: ["edad", "created_at"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
      disableOnAttributes: ["cedula"],
    },
  });

  console.log("Settings actualizados OK");
  process.exit(0);
}

async function waitForTask(uid) {
  let task;
  do {
    await new Promise((r) => setTimeout(r, 500));
    task = await client.getTask(uid);
    process.stdout.write(".");
  } while (task.status === "enqueued" || task.status === "processing");
  console.log(`\nTarea ${uid}: ${task.status}`);
  if (task.status === "failed") {
    console.error("Error:", task.error);
    process.exit(1);
  }
}

main();
