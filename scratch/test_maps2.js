// Probar con OTRO enlace de Google Maps para confirmar que coordenadas distintas se extraen correctamente
// Usaremos una URL de Google Maps directa de un lugar conocido (Plaza Bolívar de Mérida)

async function testUrl(label, shortUrl) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Probando: ${label}`);
  console.log(`URL: ${shortUrl}`);
  console.log("=".repeat(60));

  // Paso 1: Redirect manual
  const res1 = await fetch(shortUrl, {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });

  const location = res1.headers.get("location");
  console.log("Status:", res1.status);
  console.log("Location:", location ? location.substring(0, 120) + "..." : "NONE");

  if (!location) {
    console.log("❌ No hay Location header");
    return;
  }

  // Paso 2: Fetch HTML
  const res2 = await fetch(location, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
    }
  });

  const html = await res2.text();
  console.log("HTML length:", html.length);

  // Buscar center= (actual)
  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  console.log("center= match:", centerMatch ? `${centerMatch[1]}, ${centerMatch[2]}` : "NONE");

  // Buscar !3d y !4d (protocol buffer coords en URLs de Google)
  const pbMatch = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  console.log("!3d/!4d match:", pbMatch ? `${pbMatch[1]}, ${pbMatch[2]}` : "NONE");

  // Buscar APP_INITIALIZATION_STATE
  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*(\[.{0,500})/);
  if (appInit) {
    console.log("APP_INITIALIZATION_STATE (primeros 200 chars):", appInit[1].substring(0, 200));
  }

  // Buscar patrones de coordenadas en JS: null,null,lat,lng o [lat,lng]
  const jsCoords = html.match(/\[(?:null,)*(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/g);
  if (jsCoords) {
    console.log("JS array coord patterns (primeros 5):");
    jsCoords.slice(0, 5).forEach(m => console.log("  ", m));
  }

  // Buscar "lat": o "latitude":
  const latJson = html.match(/"lat(?:itude)?":\s*(-?\d+\.\d+)/g);
  if (latJson) {
    console.log("JSON lat patterns:", latJson.slice(0, 5));
  }

  // Buscar coordenadas en data-* attributes
  const dataLat = html.match(/data-lat="(-?\d+\.\d+)"/);
  const dataLng = html.match(/data-lng="(-?\d+\.\d+)"/);
  if (dataLat || dataLng) {
    console.log("data-lat/data-lng:", dataLat?.[1], dataLng?.[1]);
  }
}

async function main() {
  // Test 1: El enlace original del usuario (Caracas)
  await testUrl("Enlace usuario (Caracas)", "https://maps.app.goo.gl/FKVZEezQXZDGHDQY7");

  // Test 2: URL directa de Google Maps con coordenadas conocidas (ej Plaza Bolívar Caracas)
  await testUrl("Plaza Bolívar Caracas (directo)", "https://www.google.com/maps/place/Plaza+Bol%C3%ADvar+de+Caracas/@10.5061,-66.9145,17z");
  
  // Test 3: URL con @lat,lng en la URL
  await testUrl("Maracaibo (directo con coords)", "https://www.google.com/maps/@10.6427,-71.6125,15z");
}

main().catch(console.error);
