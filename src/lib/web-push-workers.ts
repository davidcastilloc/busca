// =============================================================================
// Web Push para Cloudflare Workers — sin Node.js crypto
// RFC 8291 (aes128gcm), RFC 8292 (VAPID), RFC 8188 (encrypted content-encoding)
// =============================================================================

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string; // base64url — clave pública ECDH del navegador
    auth: string;   // base64url — secreto de autenticación (16 bytes)
  };
}

export interface VapidKeys {
  publicKey: string;  // base64url — clave pública ECDSA P-256 sin comprimir (65 bytes)
  privateKey: string; // base64url — clave privada ECDSA P-256 (32 bytes)
  subject: string;    // mailto:xxx o URL https
}

export interface PushResult {
  success: boolean;
  status: number;
  gone: boolean; // true si 404/410 (suscripción expirada)
}

// -----------------------------------------------------------------------------
// Base64url
// -----------------------------------------------------------------------------

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  // Restaurar padding
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const withPad = pad ? padded + '===='.slice(pad) : padded;
  const binary = atob(withPad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

function encodeUTF8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// -----------------------------------------------------------------------------
// VAPID JWT (ES256 — ECDSA P-256 + SHA-256)
// -----------------------------------------------------------------------------



/**
 * Importa par ECDSA P-256 para firmar JWT.
 * rawPublic: 65 bytes (0x04 || x || y) sin comprimir
 * rawPrivate: 32 bytes (d)
 */
async function importVapidSigningKey(
  rawPublic: Uint8Array,
  rawPrivate: Uint8Array,
): Promise<CryptoKey> {
  const x = base64urlEncode(rawPublic.slice(1, 33));
  const y = base64urlEncode(rawPublic.slice(33, 65));
  const d = base64urlEncode(rawPrivate);

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    d,
    ext: true,
  };

  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

/**
 * Genera headers VAPID: Authorization y Crypto-Key.
 */
export async function generarVapidHeaders(
  endpoint: string,
  vapidKeys: VapidKeys,
): Promise<{ authorization: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const publicKeyBytes = base64urlDecode(vapidKeys.publicKey);
  const privateKeyBytes = base64urlDecode(vapidKeys.privateKey);

  // JWT Header
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = base64urlEncode(encodeUTF8(JSON.stringify(header)));

  // JWT Payload — exp = ahora + 12h
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: vapidKeys.subject,
  };
  const payloadB64 = base64urlEncode(encodeUTF8(JSON.stringify(payload)));

  // Firmar
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingKey = await importVapidSigningKey(publicKeyBytes, privateKeyBytes);

  const signatureRaw = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encodeUTF8(signingInput) as BufferSource,
  );

  // crypto.subtle devuelve firma IEEE P1363 (r || s, 64 bytes). JWT ES256 usa ese formato.
  const signatureB64 = base64urlEncode(signatureRaw);

  const jwt = `${signingInput}.${signatureB64}`;
  const authorization = `vapid t=${jwt},k=${vapidKeys.publicKey}`;

  return { authorization };
}

// -----------------------------------------------------------------------------
// Encriptación de payload — RFC 8291 (aes128gcm)
// -----------------------------------------------------------------------------

/**
 * HKDF — RFC 5869 usando crypto.subtle.
 * Extrae y expande material de clave.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  // Extract
  const prkKey = await crypto.subtle.importKey('raw', salt as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm as BufferSource));

  // Expand
  const infoKey = await crypto.subtle.importKey('raw', prk as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);

  // Para longitudes <= 32 bytes, una sola iteración basta
  const input = concatBuffers(info, new Uint8Array([1]));
  const output = new Uint8Array(await crypto.subtle.sign('HMAC', infoKey, input as BufferSource));

  return output.slice(0, length);
}

/**
 * Construye info string para HKDF según RFC 8291.
 * info = "Content-Encoding: " || type || 0x00
 */
function buildInfo(type: string): Uint8Array {
  const header = encodeUTF8(`Content-Encoding: ${type}\0`);
  return header;
}

/**
 * Construye info para clave/nonce según RFC 8291.
 * "WebPush: info\0" || ua_public || as_public
 */
function buildKeyInfo(uaPublic: Uint8Array, asPublic: Uint8Array): Uint8Array {
  return concatBuffers(encodeUTF8('WebPush: info\0'), uaPublic, asPublic);
}

/**
 * Encripta payload según RFC 8291 con aes128gcm content encoding.
 *
 * @param plaintext - payload en claro
 * @param uaPublicKey - clave pública del navegador (65 bytes, sin comprimir)
 * @param authSecret - secreto de autenticación del navegador (16 bytes)
 * @returns body encriptado listo para enviar + headers necesarios
 */
async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicKey: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  // 1. Generar par efímero ECDH del servidor (application server)
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  // Exportar clave pública del servidor (raw = 65 bytes sin comprimir)
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

  // 2. Importar clave pública del navegador (ua = user agent)
  const uaPublicCryptoKey = await crypto.subtle.importKey(
    'raw',
    uaPublicKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // 3. ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicCryptoKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // 4. Derivar IKM según RFC 8291 §3.4
  // ikm = HKDF(auth_secret, ecdh_secret, key_info, 32)
  const keyInfo = buildKeyInfo(uaPublicKey, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // 5. Generar salt aleatorio (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. Derivar CEK y nonce
  const cekInfo = buildInfo('aes128gcm');
  const nonceInfo = buildInfo('nonce');

  const cek = await hkdf(salt, ikm, cekInfo, 16); // 16 bytes para AES-128
  const nonce = await hkdf(salt, ikm, nonceInfo, 12); // 12 bytes para GCM

  // 7. Padding: añadir delimiter byte 0x02 (último registro) según RFC 8188 §2
  const paddedPlaintext = concatBuffers(plaintext, new Uint8Array([2]));

  // 8. Encriptar con AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, paddedPlaintext as BufferSource),
  );

  // 9. Construir body aes128gcm según RFC 8188 §2.1
  // header: salt (16) || rs (4, big-endian uint32) || idlen (1) || keyid (idlen bytes)
  // keyid = clave pública del servidor (65 bytes)
  const rs = 4096; // record size
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false); // big-endian

  const idlen = new Uint8Array([65]); // longitud de la clave pública

  const header = concatBuffers(salt, rsBytes, idlen, asPublicRaw);

  return concatBuffers(header, ciphertext);
}

// -----------------------------------------------------------------------------
// Función principal
// -----------------------------------------------------------------------------

/**
 * Envía notificación push a una suscripción.
 *
 * @param subscription - suscripción del navegador
 * @param payload - string del payload (normalmente JSON)
 * @param vapidKeys - claves VAPID (base64url)
 * @returns resultado con status y flags
 */
export async function enviarPushNotificacion(
  subscription: PushSubscription,
  payload: string,
  vapidKeys: VapidKeys,
): Promise<PushResult> {
  try {
    // Decodificar claves del navegador
    const uaPublicKey = base64urlDecode(subscription.keys.p256dh);
    const authSecret = base64urlDecode(subscription.keys.auth);

    // Encriptar payload
    const plaintext = encodeUTF8(payload);
    const body = await encryptPayload(plaintext, uaPublicKey, authSecret);

    // Generar headers VAPID
    const { authorization } = await generarVapidHeaders(subscription.endpoint, vapidKeys);

    // Enviar
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': String(body.length),
        TTL: '86400', // 24 horas
        Urgency: 'normal',
      },
      body: body as unknown as BodyInit,
    });

    const gone = response.status === 404 || response.status === 410;

    if (response.status === 429) {
      // Rate limited — no es gone, pero no fue exitoso
      return { success: false, status: response.status, gone: false };
    }

    return {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      gone,
    };
  } catch (error) {
    // Error de red u otro fallo
    return { success: false, status: 0, gone: false };
  }
}
