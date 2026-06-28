import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

// Helper para calcular distancia
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

// Helper para generar el teclado de refugios y opción GPS
async function getShelterKeyboard(db: D1Database): Promise<any> {
  try {
    const { results } = await db
      .prepare("SELECT nombre FROM refugios ORDER BY nombre ASC")
      .all<{ nombre: string }>();

    const keyboard: any[][] = [];
    if (results && results.length > 0) {
      // Agrupar en filas de 2 para mejor visualización
      for (let i = 0; i < results.length; i += 2) {
        const row = results.slice(i, i + 2).map((r) => ({ text: r.nombre }));
        keyboard.push(row);
      }
    }
    
    // Botón para compartir ubicación GPS real
    keyboard.push([{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }]);
    
    // Botón para cancelar
    keyboard.push([{ text: "/cancelar" }]);

    return {
      keyboard: keyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
    };
  } catch (err) {
    console.error("Error al generar teclado de refugios:", err);
    return undefined;
  }
}

export async function startSos(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  args?: string
): Promise<void> {
  if (args && args.trim().length > 0) {
    await setSession(db, telegramId, chatId, "sos_ubicacion", { insumo: args.trim() });
    const keyboard = await getShelterKeyboard(db);
    await client.sendMessage(
      chatId,
      `🚨 <b>SOS Registrado:</b> ${args.trim()}\n\n¿En qué <b>refugio o ubicación exacta</b> se necesita esto de urgencia?`,
      keyboard ? { reply_markup: keyboard } : {}
    );
  } else {
    await setSession(db, telegramId, chatId, "sos_insumo", {});
    await client.sendMessage(
      chatId,
      "🚨 <b>Alerta de Urgencia (SOS)</b>\n\n¿Qué <b>insumo o ayuda</b> se necesita con urgencia extrema?\n\n<i>/cancelar para salir.</i>"
    );
  }
}

export async function handleSosState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  location?: { latitude: number; longitude: number },
  env?: any
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Alerta SOS cancelada.", {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  // 1. Esperando Insumo
  if (currentStep === "sos_insumo") {
    if (!text || text.trim().length < 3) {
      await client.sendMessage(chatId, "⚠️ Describe la urgencia de forma más clara:");
      return;
    }
    data.insumo = text.trim();
    await setSession(db, telegramId, chatId, "sos_ubicacion", data);
    const keyboard = await getShelterKeyboard(db);
    await client.sendMessage(
      chatId,
      "📍 ¿En qué <b>refugio o ubicación exacta</b> se necesita esto?",
      keyboard ? { reply_markup: keyboard } : {}
    );
    return;
  }

  // 2. Esperando Ubicación
  if (currentStep === "sos_ubicacion") {
    // Si mandó ubicación GPS real
    if (location) {
      data.latitud = location.latitude;
      data.longitud = location.longitude;
      
      // Buscar refugio más cercano para darle contexto al reporte
      try {
        const { results } = await db.prepare("SELECT nombre, latitud, longitud FROM refugios").all<{ nombre: string; latitud: number; longitud: number }>();
        let refugioCercano = null;
        let minDist = 0.15; // 150 metros
        
        if (results) {
          for (const r of results) {
            const d = getDistance(location.latitude, location.longitude, r.latitud, r.longitud);
            if (d < minDist) {
              minDist = d;
              refugioCercano = r.nombre;
            }
          }
        }
        
        if (refugioCercano) {
          data.ubicacion = `GPS cerca de: ${refugioCercano}`;
        } else {
          data.ubicacion = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
        }
      } catch (e) {
        data.ubicacion = `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;
      }
    } else {
      if (!text || text.trim().length < 3) {
        const keyboard = await getShelterKeyboard(db);
        await client.sendMessage(chatId, "⚠️ Ubicación muy corta o inválida. Elígela o envíala de nuevo:", {
          reply_markup: keyboard
        });
        return;
      }
      
      // Intentar buscar si coincide exactamente con el nombre de un refugio
      try {
        const shelter = await db
          .prepare("SELECT nombre, latitud, longitud FROM refugios WHERE nombre = ?")
          .bind(text.trim())
          .first<{ nombre: string; latitud: number; longitud: number }>();

        if (shelter) {
          data.ubicacion = shelter.nombre;
          data.latitud = shelter.latitud;
          data.longitud = shelter.longitud;
        } else {
          data.ubicacion = text.trim();
        }
      } catch (e) {
        data.ubicacion = text.trim();
      }
    }

    try {
      if (env?.CENSO_QUEUE) {
        await env.CENSO_QUEUE.send({
          type: "reporte",
          data: {
            tipo: "necesidad",
            descripcion: `URGENCIA: ${data.insumo}`,
            ubicacion_nombre: data.ubicacion,
            latitud: data.latitud || null,
            longitud: data.longitud || null,
            reportante_nombre: "Voluntario SOS",
            reportante_contacto: `Telegram ID: ${telegramId}`
          }
        });
      }

      // Notificar a los Admins inmediatamente
      if (env?.TELEGRAM_ADMIN_IDS) {
        const adminIds = env.TELEGRAM_ADMIN_IDS.split(",").map((id: string) => id.trim());
        const alertMsg = `🆘 <b>¡ALERTA URGENTE DE VOLUNTARIO!</b> 🆘\n\n<b>Insumo/Ayuda:</b> ${data.insumo}\n<b>Ubicación:</b> ${data.ubicacion}\n<b>Voluntario ID:</b> <code>${telegramId}</code>`;
        
        for (const aId of adminIds) {
          try {
            await client.sendMessage(aId, alertMsg);
            if (data.latitud && data.longitud) {
              await client.sendLocation(aId, data.latitud, data.longitud);
            }
          } catch (e) {
            console.error(`No se pudo enviar alerta al admin ${aId}`);
          }
        }
      }

      await client.sendMessage(
        chatId,
        "✅ <b>¡SOS ENVIADO!</b>\n\nLa alerta ha sido enviada al centro de mando y registrada en el mapa.",
        { reply_markup: { remove_keyboard: true } }
      );
      
      if (data.latitud && data.longitud) {
        await client.sendLocation(chatId, data.latitud, data.longitud);
      }
    } catch (err) {
      console.error("Error enviando SOS:", err);
      await client.sendMessage(chatId, "❌ Error al enviar la alerta.", {
        reply_markup: { remove_keyboard: true }
      });
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
