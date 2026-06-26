const CACHE_NAME = "busca-cache-v2";
const STATIC_ASSETS = [
  "/",
  "/registrar",
  "/reportar",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// INSTALL: Cachear rutas estáticas + skip waiting
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE: Limpiar caches viejos + claim clients
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH: Estrategia diferenciada para 3G
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API calls: siempre a red (no cachear datos dinámicos)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Assets estáticos (/_astro/*): CACHE-FIRST
  // Estos tienen hash en filename, son inmutables
  if (url.pathname.startsWith("/_astro/")) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, clone);
            });
          }
          return response;
        }).catch(() => {
          return new Response("Asset no disponible offline", { status: 503 });
        });
      })
    );
    return;
  }

  // Iconos y manifest: CACHE-FIRST
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json" || url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Páginas HTML: NETWORK-FIRST con fallback a cache
  if (e.request.mode === "navigate" || e.request.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(e.request).then((cached) => {
            if (cached) return cached;
            // Fallback: página principal
            return caches.match("/").then((home) => {
              if (home) return home;
              return new Response(
                `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BUSCA - Sin Conexión</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;color:#000;padding:20px;text-align:center}h1{font-size:28px;margin-bottom:12px}p{color:#5e5e5e;font-size:16px;line-height:1.5;max-width:400px}button{margin-top:20px;padding:14px 28px;border-radius:999px;background:#000;color:#fff;border:none;font-size:16px;font-weight:500;cursor:pointer}</style></head><body><div><h1>Sin Conexión</h1><p>No hay conexión a internet. Los datos guardados localmente se sincronizarán automáticamente cuando vuelvas a tener red.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`,
                { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
              );
            });
          });
        })
    );
    return;
  }

  // Todo lo demás: STALE-WHILE-REVALIDATE
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(() => cached || new Response("", { status: 503 }));

      return cached || fetchPromise;
    })
  );
});

// BACKGROUND SYNC: Sincronizar registros pendientes
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-censo") {
    e.waitUntil(sincronizarRegistrosPendientes());
  }
});

async function sincronizarRegistrosPendientes() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("busca-offline-db", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction("sync-queue", "readonly");
    const store = tx.objectStore("sync-queue");

    const pendientes = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });

    if (!pendientes || pendientes.length === 0) return;

    for (const item of pendientes) {
      if (item.data && item.data.foto_key && item.data.foto_key.startsWith("data:image/")) {
        try {
          const resp = await fetch(item.data.foto_key);
          const blob = await resp.blob();
          const formData = new FormData();
          formData.append("foto", blob, "foto-offline.jpg");

          const uploadResp = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });

          if (uploadResp.ok) {
            const uploadData = await uploadResp.json();
            item.data.foto_key = uploadData.key;
          }
        } catch (uploadErr) {
          console.error("Error subiendo foto offline:", uploadErr);
        }
      }

      const endpoint = item.tipo === "persona" ? "/api/personas" : "/api/reportes";

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.data)
        });

        if (response.ok) {
          const deleteTx = db.transaction("sync-queue", "readwrite");
          deleteTx.objectStore("sync-queue").delete(item.id);
        }
      } catch (syncErr) {
        console.error("Error sincronizando registro:", syncErr);
      }
    }
  } catch (error) {
    console.error("Error en sincronización background:", error);
  }
}
