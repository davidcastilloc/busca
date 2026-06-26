const CACHE_NAME = "busca-cache-v1";
const ASSETS = [
  "/",
  "/registrar",
  "/reportar",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

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

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request).then((cachedResp) => {
        if (cachedResp) return cachedResp;
        if (e.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Recurso offline no disponible", { status: 503 });
      });
    })
  );
});

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
          const blob = dataURLtoBlob(item.data.foto_key);
          const formData = new FormData();
          formData.append("foto", blob, "offline-photo.jpg");

          const imgResp = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });

          if (imgResp.ok) {
            const imgData = await imgResp.json();
            item.data.foto_key = imgData.key;
          }
        } catch (err) {
          console.error("Fallo al subir imagen en sync de SW:", err);
          item.data.foto_key = null;
        }
      }
    }

    const resp = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendientes)
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.success) {
        const writeTx = db.transaction("sync-queue", "readwrite");
        const writeStore = writeTx.objectStore("sync-queue");
        for (const item of pendientes) {
          if (item.id !== undefined) {
            writeStore.delete(item.id);
          }
        }
        await new Promise((resolve) => {
          writeTx.oncomplete = () => resolve();
        });
        console.log("Cola sincronizada con éxito en SW.");
      }
    }
  } catch (err) {
    console.error("Fallo en sincronización en SW:", err);
  }
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(",");
  const match = arr[0].match(/:(.*?);/);
  const mime = match ? match[1] : "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
