import { TelegramClient } from "./client";
import { getDistance } from "./utils";

export async function processHourlyAlerts(env: {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
}): Promise<void> {
  try {
    const db = env.DB;
    const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

    // 1. Obtener necesidades creadas/actualizadas en la última hora (65 min para tener un buffer)
    const { results: needs } = await db.prepare(`
      SELECT n.id, n.categoria, n.gravedad, n.descripcion,
             COALESCE(n.latitud, ref.latitud) as latitud,
             COALESCE(n.longitud, ref.longitud) as longitud,
             COALESCE(ref.nombre, 'Sin refugio') as refugio_nombre
      FROM necesidades n
      LEFT JOIN refugios ref ON n.refugio_id = ref.id
      WHERE n.estado = 'abierta'
        AND n.created_at >= datetime('now', '-65 minutes')
        AND (n.latitud IS NOT NULL OR ref.latitud IS NOT NULL)
    `).all<any>();

    if (!needs || needs.length === 0) {
      console.log("No hay nuevas necesidades geolocalizadas registradas en la última hora.");
      return;
    }

    // 2. Obtener todas las suscripciones activas
    const { results: subs } = await db.prepare(`
      SELECT telegram_chat_id, latitud, longitud, radio_km 
      FROM alertas_suscripciones 
      WHERE activo = 1
    `).all<any>();

    if (!subs || subs.length === 0) {
      console.log("No hay voluntarios suscritos a alertas geolocalizadas.");
      return;
    }

    console.log(`Procesando cron de alertas: ${needs.length} necesidades vs ${subs.length} suscriptores.`);

    // 3. Cruzar necesidades con suscriptores por distancia
    for (const sub of subs) {
      const chatNeeds: any[] = [];

      for (const need of needs) {
        if (need.latitud && need.longitud) {
          const dist = getDistance(sub.latitud, sub.longitud, need.latitud, need.longitud);
          const maxRadio = sub.radio_km || 10.0;
          
          if (dist <= maxRadio) {
            chatNeeds.push({
              ...need,
              distancia: dist
            });
          }
        }
      }

      // 4. Si el voluntario tiene necesidades en su radio, enviar reporte consolidado
      if (chatNeeds.length > 0) {
        // Ordenar por gravedad (alta primero) y luego distancia
        chatNeeds.sort((a, b) => {
          const aHigh = a.gravedad.toLowerCase().includes("alta") ? 1 : 0;
          const bHigh = b.gravedad.toLowerCase().includes("alta") ? 1 : 0;
          if (aHigh !== bHigh) return bHigh - aHigh;
          return a.distancia - b.distancia;
        });

        let msg = `🔔 <b>Resumen de Nuevas Necesidades en tu Zona (Radio ${sub.radio_km || 10}km)</b> 🔔\n\n` +
          `Se han reportado los siguientes requerimientos cerca de tu posición en la última hora:\n\n`;

        chatNeeds.forEach((n, idx) => {
          const gravEmoji = n.gravedad.toLowerCase().includes("alta") ? "🔴" : n.gravedad.toLowerCase().includes("media") ? "🟡" : "🔵";
          msg += `${idx + 1}. ${gravEmoji} <b>[${n.categoria}]</b> en <b>${n.refugio_nombre}</b>\n`;
          msg += `   📏 Distancia: <b>${n.distancia.toFixed(1)} km</b>\n`;
          msg += `   📝 <i>"${n.descripcion}"</i>\n`;
          msg += `   👉 ID para marcar cubierta: <code>/cubierta ${n.id}</code>\n\n`;
        });

        msg += `🚗 <i>Si puedes colaborar, pulsa 'Voy en Camino' en el mapa web para organizarnos mejor.</i>`;

        try {
          await client.sendMessage(sub.telegram_chat_id, msg);
        } catch (e) {
          // Si falló (ej: chat bloqueado), podríamos desactivar la suscripción para optimizar
          console.error(`Error al enviar alerta cron al chat ${sub.telegram_chat_id}:`, e);
        }
      }
    }
  } catch (error) {
    console.error("Error crítico en proceso cron de alertas geolocalizadas:", error);
  }
}
