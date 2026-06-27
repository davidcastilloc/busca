async function resolve(label, shortUrl) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label}: ${shortUrl}`);
  
  // Paso 1: redirect manual
  const res1 = await fetch(shortUrl, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  const location = res1.headers.get("location");
  console.log("Location:", location ? location.substring(0, 200) : "NONE");
  
  if (!location) {
    console.log("❌ Sin redirect");
    return;
  }

  // Paso 2: fetch HTML
  const res2 = await fetch(location, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA",
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache"
    }
  });
  
  const html = await res2.text();
  console.log("HTML length:", html.length);
  console.log("Final URL:", res2.url.substring(0, 150));

  // APP_INITIALIZATION_STATE
  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[([^\]]+)\]/);
  if (appInit) {
    const parts = appInit[1].split(",");
    const lng = parseFloat(parts[1]);
    const lat = parseFloat(parts[2]);
    console.log(`APP_INIT → lat: ${lat}, lng: ${lng}`);
  } else {
    console.log("APP_INITIALIZATION_STATE: NO ENCONTRADO");
  }

  // center=
  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (centerMatch) {
    console.log(`center= → lat: ${centerMatch[1]}, lng: ${centerMatch[2]}`);
  }

  // Buscar el titulo de la pagina para confirmar que es un lugar diferente
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    console.log(`Título: ${titleMatch[1].substring(0, 100)}`);
  }
}

async function main() {
  await resolve("Enlace 1", "https://maps.app.goo.gl/qJCFthEvgJ37FidS6");
  await resolve("Enlace 2", "https://maps.app.goo.gl/FKVZEezQXZDGHDQY7");
}

main().catch(console.error);
