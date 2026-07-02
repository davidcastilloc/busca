import { TelegramClient } from "./client";

export async function notifyAdmins(
  env: any,
  message: string,
  options?: any
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const adminIdsStr = env.TELEGRAM_ADMIN_IDS;

  if (!token || !adminIdsStr) {
    // No está configurado el bot de Telegram, ignorar de forma silenciosa
    return;
  }

  try {
    const client = new TelegramClient(token);
    const adminIds = adminIdsStr.split(",").map((id: string) => id.trim());

    for (const adminId of adminIds) {
      if (adminId) {
        try {
          await client.sendMessage(adminId, message, options);
        } catch (err) {
          console.error(`Error enviando notificación de Telegram al admin ${adminId}:`, err);
        }
      }
    }
  } catch (error) {
    console.error("Error en helper notifyAdmins:", error);
  }
}

export async function notificarCercanos(
  env: any,
  lat: number,
  lon: number,
  mensaje: string
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !env.DB) return;

  try {
    const client = new TelegramClient(token);
    const radiusGrad = 0.09; // ~10km bounding box

    const { results } = await env.DB.prepare(`
      SELECT telegram_chat_id, latitud, longitud, radio_km 
      FROM alertas_suscripciones 
      WHERE activo = 1
        AND latitud BETWEEN ?1 - ?3 AND ?1 + ?3
        AND longitud BETWEEN ?2 - ?3 AND ?2 + ?3
    `).bind(lat, lon, radiusGrad).all();

    if (!results || results.length === 0) return;

    // Distancia Haversine simple
    const toRad = (x: number) => x * Math.PI / 180;
    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; 
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    for (const sub of results) {
      const dist = getDistance(lat, lon, sub.latitud, sub.longitud);
      if (dist <= (sub.radio_km || 10.0)) {
        try {
          await client.sendMessage(sub.telegram_chat_id, mensaje);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("Error notificando cercanos:", err);
  }
}
