// Analizar exhaustivamente el HTML de un Google Maps Place para encontrar
// TODOS los patrones de coordenadas disponibles

async function analyze(shortUrl) {
  // Redirect manual
  const res1 = await fetch(shortUrl, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const location = res1.headers.get("location");
  if (!location) { console.log("No redirect"); return; }

  console.log("Redirect URL:", location.substring(0, 150));

  // Fetch HTML
  const res2 = await fetch(location, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
    }
  });

  const html = await res2.text();
  console.log("HTML length:", html.length);

  // 1. APP_INITIALIZATION_STATE
  const appInit = html.match(/APP_INITIALIZATION_STATE\s*=\s*\[\[\[([^\]]+)\]/);
  if (appInit) {
    const parts = appInit[1].split(",");
    console.log("APP_INITIALIZATION_STATE raw:", parts.slice(0, 4));
    if (parts.length >= 3) {
      console.log("  → lat:", parseFloat(parts[2]), "lng:", parseFloat(parts[1]));
    }
  }

  // 2. center= (og:image)
  const centerMatches = [...html.matchAll(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/gi)];
  console.log("center= matches:", centerMatches.map(m => `${m[1]}, ${m[2]}`));

  // 3. !3d...!4d...
  const pbMatches = [...html.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  console.log("!3d/!4d matches:", pbMatches.map(m => `${m[1]}, ${m[2]}`));

  // 4. Buscar coordenadas en window.APP_OPTIONS
  const appOpts = html.match(/APP_OPTIONS\s*=\s*(\[.{0,1000})/);
  if (appOpts) {
    console.log("APP_OPTIONS (primeros 300):", appOpts[1].substring(0, 300));
  }

  // 5. Buscar cosas como \\\"lat\\\":10.xxx
  const latLng = [...html.matchAll(/\\?"lat(?:itude)?\\?":\s*(-?\d+\.\d{4,})/g)];
  console.log("lat JSON matches:", latLng.map(m => m[1]).slice(0, 10));

  // 6. Buscar Google Maps JS data pattern: ,lat,lng,  (dos decimales seguidos que parezcan coordenadas)
  // Filtrar solo valores que parecen coordenadas (lat: -90 a 90, lng: -180 a 180)
  const allDecimals = [...html.matchAll(/(-?\d{1,3}\.\d{4,8})/g)].map(m => parseFloat(m[1]));
  const possibleLats = allDecimals.filter(v => Math.abs(v) <= 90 && Math.abs(v) > 0.1);
  const possibleLngs = allDecimals.filter(v => Math.abs(v) > 90 && Math.abs(v) <= 180);
  
  // Contar frecuencia de cada coordenada
  const latCounts = {};
  possibleLats.forEach(v => {
    const key = v.toFixed(4);
    latCounts[key] = (latCounts[key] || 0) + 1;
  });
  const lngCounts = {};
  possibleLngs.forEach(v => {
    const key = v.toFixed(4);
    lngCounts[key] = (lngCounts[key] || 0) + 1;
  });

  console.log("Latitudes más frecuentes:", Object.entries(latCounts).sort((a,b) => b[1]-a[1]).slice(0, 5));
  console.log("Longitudes más frecuentes:", Object.entries(lngCounts).sort((a,b) => b[1]-a[1]).slice(0, 5));
}

analyze("https://maps.app.goo.gl/FKVZEezQXZDGHDQY7").catch(console.error);
