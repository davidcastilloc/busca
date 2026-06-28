export async function hashPIN(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Verificar sesión del voluntario a partir del token de cookie
export async function obtenerVoluntarioSesion(DB: any, token: string | undefined): Promise<any | null> {
  if (!token || !DB) return null;
  try {
    const sesion = await DB.prepare(`
      SELECT v.* FROM sesiones_voluntarios s
      JOIN voluntarios v ON s.voluntario_id = v.id
      WHERE s.token = ? AND v.activo = 1 AND s.expires_at > datetime('now', '-4 hours')
    `).bind(token).first();
    return sesion || null;
  } catch (error) {
    console.error("Error al obtener sesion de voluntario:", error);
    return null;
  }
}
