import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

import { getShelterKeyboard, resolveLocation } from "../utils";

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
    const resolved = await resolveLocation(db, text, location);
    
    if (!resolved.valid) {
      const keyboard = await getShelterKeyboard(db);
      await client.sendMessage(chatId, "⚠️ Ubicación muy corta o inválida. Elígela o envíala de nuevo:", {
        reply_markup: keyboard
      });
      return;
    }

    data.ubicacion = resolved.ubicacion_nombre;
    data.latitud = resolved.latitud;
    data.longitud = resolved.longitud;
    data.refugio_id = resolved.refugio_id;
    data.hospital_id = resolved.hospital_id;
    data.centro_acopio_id = resolved.centro_acopio_id;

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
            refugio_id: data.refugio_id || null,
            hospital_id: data.hospital_id || null,
            centro_acopio_id: data.centro_acopio_id || null,
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
