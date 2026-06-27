async function run() {
  const url = "https://maps.app.goo.gl/qJCFthEvgJ37FidS6";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const text = await res.text();
    
    // Test regex simple
    const match = text.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i);
    if (match) {
      console.log("MATCH ENCONTRADO CON EXITO:");
      console.log("Lat:", match[1]);
      console.log("Lng:", match[2]);
    } else {
      console.log("Ningún match con center=lat,lng");
    }
  } catch (err) {
    console.error(err);
  }
}
run();
