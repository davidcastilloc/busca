import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface PersonaItem {
  type: "persona";
  data: any;
  timestamp: number;
}

interface ReporteItem {
  type: "reporte";
  data: any;
  timestamp: number;
}

type QueueItem = (PersonaItem | ReporteItem) & { id?: number };

interface CensoDB extends DBSchema {
  "sync-queue": {
    key: number;
    value: QueueItem;
    indexes: { "by-timestamp": number };
  };
}

const DB_NAME = "busca-offline-db";
const STORE_NAME = "sync-queue";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CensoDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<CensoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("by-timestamp", "timestamp");
        }
      },
    });
  }
  return dbPromise;
}

export async function encolarRegistro(type: "persona" | "reporte", data: any): Promise<number | null> {
  const db = await getDB();
  if (!db) return null;
  
  const id = await db.add(STORE_NAME, {
    type,
    data,
    timestamp: Date.now(),
  });

  // Intentar registrar background sync si está disponible en el Service Worker
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // @ts-ignore - SyncManager no está en todos los tipos de TS por defecto
      await reg.sync.register("sync-censo");
    } catch (e) {
      console.warn("No se pudo registrar Background Sync:", e);
    }
  }
  
  return id;
}

export async function obtenerPendientes(): Promise<QueueItem[]> {
  const db = await getDB();
  if (!db) return [];
  return db.getAll(STORE_NAME);
}

export async function eliminarRegistro(id: number): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete(STORE_NAME, id);
}

export async function contarPendientes(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count(STORE_NAME);
}

export async function vaciarCola(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, "readwrite");
  await tx.objectStore(STORE_NAME).clear();
  await tx.done;
}
