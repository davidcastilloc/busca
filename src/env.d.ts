/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    voluntario?: {
      id: number;
      nombre: string;
      telefono: string;
    };
  }
}

interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  FOTOS_BUCKET: R2Bucket;
  CENSO_QUEUE: Queue<any>;
  VECTOR_INDEX: VectorizeIndex;
  AI: any;
}
