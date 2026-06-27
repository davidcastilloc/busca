// Extraer coordenadas de APP_INITIALIZATION_STATE que tiene formato:
// [[[altitud, lng, lat], ...], ...]

async function resolveShortUrl(shortUrl) {
  // Paso 1: redirect manual
  const res1 = await fetch(shortUrl, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const location = res1.headers.get("location");
  if (!location) return null;

  // Paso 2: fetch HTML
  const res2 = await fetch(location, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
    }
  });

  const html = await res2.text();
  
  // Método 1: APP_INITIALIZATION_STATE
  // Formato: [[[altitud, lng, lat], ...]]
  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[([^\]]+)\]/);
  if (appInit) {
    const parts = appInit[1].split(",");
    if (parts.length >= 3) {
      const lng = parseFloat(parts[1]);
      const lat = parseFloat(parts[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { method: "APP_INITIALIZATION_STATE", lat, lng };
      }
    }
  }

  // Método 2: center= en og:image (fallback)
  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (centerMatch) {
    return { method: "center=", lat: parseFloat(centerMatch[1]), lng: parseFloat(centerMatch[2]) };
  }

  return null;
}

async function main() {
  const url = "https://maps.app.goo.gl/FKVZEezQXZDGHDQY7";
  const result = await resolveShortUrl(url);
  console.log("Resultado:", result);
  
  // Verificar: las coordenadas de APP_INITIALIZATION_STATE vs center=
  // Para este lugar en Caracas, debería ser approx 10.486, -66.893
}

main().catch(console.error);
