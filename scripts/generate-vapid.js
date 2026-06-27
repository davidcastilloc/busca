/**
 * Script para generar par de claves VAPID (Voluntary Application Server Identification).
 * 
 * Uso:
 *   node scripts/generate-vapid.js
 * 
 * Luego configurar en Cloudflare:
 *   npx wrangler secret put VAPID_PRIVATE_KEY
 *   npx wrangler secret put VAPID_SUBJECT    (ej: mailto:admin@dondeestan.org)
 * 
 * La VAPID_PUBLIC_KEY va como variable normal en wrangler.jsonc (no es secreta).
 */

async function generateVapidKeys() {
  // Generar par de claves ECDSA P-256 usando Web Crypto
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  // Exportar clave privada como PKCS8
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  // Exportar clave pública como raw (65 bytes uncompressed point)
  const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  const privateKeyB64 = bufferToBase64url(privateKeyBuffer);
  const publicKeyB64 = bufferToBase64url(publicKeyBuffer);

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║          CLAVES VAPID GENERADAS CON ÉXITO                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log("VAPID_PUBLIC_KEY (va en wrangler.jsonc como variable):");
  console.log(publicKeyB64);
  console.log("");
  
  console.log("VAPID_PRIVATE_KEY (va como secret con wrangler):");
  console.log(privateKeyB64);
  console.log("");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  PASOS SIGUIENTES:                                       ║");
  console.log("║                                                           ║");
  console.log("║  1. Copiar VAPID_PUBLIC_KEY a wrangler.jsonc:             ║");
  console.log("║     vars = { VAPID_PUBLIC_KEY = \"<clave>\" }              ║");
  console.log("║                                                           ║");
  console.log("║  2. Configurar secrets:                                   ║");
  console.log("║     npx wrangler secret put VAPID_PRIVATE_KEY             ║");
  console.log("║     npx wrangler secret put VAPID_SUBJECT                 ║");
  console.log("║     (usar: mailto:admin@dondeestan.org)                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

generateVapidKeys().catch(console.error);
