// Usar fetch nativo de Node.js

async function test() {
  const url = "https://maps.app.goo.gl/FKVZEezQXZDGHDQY7";
  console.log("Resolviendo:", url);

  // Paso 1: Hacer fetch manual sin seguir redireccion automatically
  let res = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  console.log("Status:", res.status);
  let nextUrl = res.headers.get("location");
  console.log("Location header:", nextUrl);

  if (!nextUrl) {
    console.error("No redirect location header found!");
    return;
  }

  // Paso 2: Hacer fetch a la URL de redireccion, agregando la cookie SOCS para saltar consentimiento
  res = await fetch(nextUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cookie": "SOCS=CAESHAgCEitib3NleGNhX2Jvb2ttYXJrX2NvbnNlbnRfZ2xvYmFsX2FjY2VwdGVkEgRpdCBJADACGgJpdCABGgQIP1gA"
    }
  });

  console.log("Final URL:", res.url);
  const html = await res.text();
  console.log("HTML length:", html.length);

  const centerMatch = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
  if (centerMatch) {
    console.log("Coordenadas encontradas en HTML:");
    console.log("  Lat:", parseFloat(centerMatch[1]));
    console.log("  Lng:", parseFloat(centerMatch[2]));
  } else {
    console.log("No se encontraron coordenadas center en HTML.");
  }
}

test().catch(console.error);
