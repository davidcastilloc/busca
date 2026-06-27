// Simular la lógica completa del resolver actualizado

function extraerDeUrl(urlStr) {
  try {
    const decoded = decodeURIComponent(urlStr);
    let match = decoded.match(/!8m2!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    match = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    match = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), aproximado: true };
    match = decoded.match(/[?&](q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { lat: parseFloat(match[2]), lng: parseFloat(match[3]) };
  } catch {}
  return null;
}

function extraerDireccionDeUrl(urlStr) {
  try {
    const decoded = decodeURIComponent(urlStr).replace(/\+/g, " ");
    const placeMatch = decoded.match(/\/place\/([^/?]+)/);
    if (!placeMatch) return [];
    let raw = placeMatch[1].trim();
    raw = raw.replace(/^[23456789CFGHJMPQRVWX]{4,8}[+ ][23456789CFGHJMPQRVWX]{2,3}\s*/i, "").trim();
    if (!raw) return [];
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return [];
    const queries = [];
    if (parts.length >= 3) {
      queries.push(parts.slice(1).join(", ") + ", Venezuela");
    }
    queries.push(parts.join(", ") + ", Venezuela");
    const calles = parts.filter(p => /^(av|calle|carrera|urbanizaci|sector|barrio|parroquia|boulevard|blvd)/i.test(p));
    const ciudades = parts.filter(p => /\d{4}/.test(p) || /^(caracas|maracaibo|valencia|barquisimeto|maracay|mérida|maturín|barinas|guanare|ciudad|san|puerto|punto)/i.test(p));
    if (calles.length > 0 && ciudades.length > 0) {
      queries.unshift(calles.join(", ") + ", " + ciudades[0] + ", Venezuela");
    }
    return queries;
  } catch {}
  return [];
}

async function geocodificarNominatim(queries) {
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=ve`;
      const res = await fetch(url, {
        headers: { "User-Agent": "dondeestan.org", "Accept-Language": "es" }
      });
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), query: q };
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1100)); // rate limit
  }
  return null;
}

async function resolve(label, shortUrl) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${label}: ${shortUrl}`);
  
  const res1 = await fetch(shortUrl, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
  const location = res1.headers.get("location");
  if (!location) { console.log("❌ Sin redirect"); return; }
  
  // Paso 1: extraer coords exactas de la URL
  const coords = extraerDeUrl(location);
  if (coords && !coords.aproximado) {
    console.log(`✅ Coords exactas de URL: ${coords.lat}, ${coords.lng}`);
    return;
  }
  
  // Paso 2: extraer dirección y geocodificar
  const queries = extraerDireccionDeUrl(location);
  console.log("Queries Nominatim:", queries);
  
  if (queries.length > 0) {
    const geocoded = await geocodificarNominatim(queries);
    if (geocoded) {
      console.log(`✅ Nominatim: ${geocoded.lat}, ${geocoded.lng} (query: "${geocoded.query}")`);
      return;
    }
  }
  
  // Paso 3: fallback aproximado
  if (coords) {
    console.log(`⚠️ Solo aproximado: ${coords.lat}, ${coords.lng}`);
  } else {
    console.log("❌ Sin coordenadas");
  }
}

async function main() {
  await resolve("COLEGIO (real: 10.5182, -66.9228)", "https://maps.app.goo.gl/FKVZEezQXZDGHDQY7");
  await resolve("BURGER (real: 10.5210, -66.9253)", "https://maps.app.goo.gl/i44sAiKjmPBwc8kY6");
}

main().catch(console.error);
