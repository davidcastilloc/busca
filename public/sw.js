// ═══════════════════════════════════════════════════════════
// Service Worker — dondeestan.org
// Estrategias: Cache-First (assets), Network-First (HTML),
// Background Sync, Push Notifications, Update controlado
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = "busca-cache-v6";
const TILES_CACHE = "busca-tiles-v1";
const API_CACHE = "busca-api-v1";
const FOTOS_CACHE = "busca-fotos-v1";
const STATIC_ASSETS = [
  "/",
  "/registrar",
  "/reportar",
  "/refugios/mapa",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Patrones de vibración por tipo de alerta
const PATRONES_VIBRACION = {
  evacuacion: [200, 100, 200],
  replica: [500, 200, 500, 200, 500],
  info: [400],
};

// ═══════════════════════════════════════════════════════════
// INSTALL: Cachear rutas estáticas (NO skipWaiting automático)
// ═══════════════════════════════════════════════════════════
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
    // NO llamamos self.skipWaiting() aquí.
    // El usuario decide cuándo activar la nueva versión via UpdateToast.
  );
});

// ═══════════════════════════════════════════════════════════
// ACTIVATE: Limpiar caches viejos + claim clients
// ═══════════════════════════════════════════════════════════
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      const keepCaches = [CACHE_NAME, TILES_CACHE, API_CACHE, FOTOS_CACHE];
      return Promise.all(
        keys.map((key) => {
          if (!keepCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ═══════════════════════════════════════════════════════════
// MESSAGE: Recibir comandos del cliente (skipWaiting controlado)
// ═══════════════════════════════════════════════════════════
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ═══════════════════════════════════════════════════════════
// FETCH: Estrategia diferenciada para 3G
// ═══════════════════════════════════════════════════════════
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Solo cachear peticiones GET
  if (e.request.method !== "GET") {
    return;
  }

  // API refugios: Network First con cache fallback (para offline)
  if (url.pathname === "/api/refugios") {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || new Response(JSON.stringify({ refugios: [] }), { status: 503, headers: { "Content-Type": "application/json" } })))
    );
    return;
  }

  // Fotos de refugios (GET /api/upload?key=...): Stale-While-Revalidate (para offline)
  if (url.pathname === "/api/upload" && url.searchParams.has("key")) {
    e.respondWith(
      caches.open("busca-fotos-v1").then((cache) => {
        return cache.match(e.request).then((cached) => {
          const fetchPromise = fetch(e.request).then((response) => {
            if (response.ok) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Otras API calls: siempre a red (no cachear)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Tiles OpenStreetMap: Stale While Revalidate
  if (url.hostname.includes("tile.openstreetmap.org")) {
    e.respondWith(
      caches.open(TILES_CACHE).then((cache) => {
        return cache.match(e.request).then((cached) => {
          const fetchPromise = fetch(e.request).then((response) => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
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

// ═══════════════════════════════════════════════════════════
// BACKGROUND SYNC: Sincronizar registros pendientes
// ═══════════════════════════════════════════════════════════
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-censo") {
    e.waitUntil(sincronizarRegistrosPendientes());
  }
});

async function sincronizarRegistrosPendientes() {
  try {
    const db = await abrirDB();
    const tx = db.transaction("sync-queue", "readonly");
    const store = tx.objectStore("sync-queue");

    const pendientes = await promisifyRequest(store.getAll());

    if (!pendientes || pendientes.length === 0) return;

    // Notificar progreso a clientes activos
    notificarClientes({ type: "sync-start", total: pendientes.length });

    // Procesar en batches de 5 para no saturar red 3G
    const BATCH_SIZE = 5;
    let sincronizados = 0;
    let errores = 0;

    for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
      const batch = pendientes.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        try {
          // Subir fotos base64 primero
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
              } else {
                item.data.foto_key = null; // Limpiar para no bloquear el registro
              }
            } catch (uploadErr) {
              item.data.foto_key = null;
            }
          }

          const endpoint = item.tipo === "persona" ? "/api/personas" : "/api/reportes";

          const response = await fetchConRetry(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.data)
          }, 3);

          if (response.ok) {
            const deleteTx = db.transaction("sync-queue", "readwrite");
            deleteTx.objectStore("sync-queue").delete(item.id);
            sincronizados++;
          } else {
            errores++;
          }
        } catch (syncErr) {
          errores++;
        }
      }

      // Notificar progreso parcial
      notificarClientes({
        type: "sync-progress",
        sincronizados,
        errores,
        total: pendientes.length
      });
    }

    // Notificar finalización
    notificarClientes({
      type: "sync-complete",
      sincronizados,
      errores,
      total: pendientes.length
    });

  } catch (error) {
    notificarClientes({ type: "sync-error", error: String(error) });
  }
}

/**
 * Fetch con retry y backoff exponencial
 */
async function fetchConRetry(url, options, maxRetries) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    // Backoff exponencial: 1s, 2s, 4s
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw lastError;
}

/**
 * Notificar a todos los clientes activos (tabs abiertos)
 */
async function notificarClientes(data) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage(data);
  }
}

/**
 * Helpers IndexedDB para Service Worker (sin la lib idb)
 */
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("busca-offline-db", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("sync-queue")) {
        const store = db.createObjectStore("sync-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-timestamp", "timestamp");
      }
    };
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ═══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS: Recibir y mostrar notificaciones
// ═══════════════════════════════════════════════════════════
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { titulo: "Alerta de Emergencia", mensaje: e.data?.text() || "" };
  }

  const tipo = data.tipo || "info";
  const patron = PATRONES_VIBRACION[tipo] || PATRONES_VIBRACION.info;

  const options = {
    body: data.mensaje || "Se ha emitido una alerta de emergencia.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `alerta-${tipo}-${Date.now()}`,
    renotify: true,
    requireInteraction: tipo !== "info", // Evacuación y réplica requieren interacción
    vibrate: patron,
    data: {
      url: data.url || "/",
      tipo: tipo,
    },
    actions: [
      { action: "open", title: "Ver detalles" },
      { action: "dismiss", title: "Cerrar" },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(
      data.titulo || "🚨 Alerta de Emergencia",
      options
    )
  );
});

// ═══════════════════════════════════════════════════════════
// NOTIFICATION CLICK: Abrir la URL correcta
// ═══════════════════════════════════════════════════════════
self.addEventListener("notificationclick", (e) => {
  e.notification.close();

  if (e.action === "dismiss") return;

  const urlDestino = e.notification.data?.url || "/";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una pestaña abierta, enfocarla y navegar
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(urlDestino);
          return;
        }
      }
      // Si no, abrir nueva pestaña
      return self.clients.openWindow(urlDestino);
    })
  );
});
