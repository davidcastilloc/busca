import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startSos(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  args?: string
): Promise<void> {
  if (args && args.trim().length > 0) {
    // If user provided args, parse them (expecting 'urgency shelter')
    // Simplest is to just ask for both to avoid parsing errors
    await setSession(db, telegramId, chatId, "sos_ubicacion", { insumo: args.trim() });
    await client.sendMessage(
      chatId,
      `🚨 <b>SOS Registrado:</b> ${args.trim()}\n\n¿En qué <b>refugio o ubicación exacta</b> se necesita esto de urgencia?`
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
  env?: any
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Alerta SOS cancelada.");
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
    await client.sendMessage(
      chatId,
      "📍 ¿En qué <b>refugio o ubicación exacta</b> se necesita esto?"
    );
    return;
  }

  // 2. Esperando Ubicación
  if (currentStep === "sos_ubicacion") {
    if (!text || text.trim().length < 3) {
      await client.sendMessage(chatId, "⚠️ Ubicación muy corta. Envíala de nuevo:");
      return;
    }
    data.ubicacion = text.trim();

    try {
      if (env?.CENSO_QUEUE) {
        await env.CENSO_QUEUE.send({
          type: "reporte",
          data: {
            tipo: "necesidad",
            descripcion: `URGENCIA: ${data.insumo}`,
            ubicacion_nombre: data.ubicacion,
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
          } catch (e) {
            console.error(`No se pudo enviar alerta al admin ${aId}`);
          }
        }
      }

      await client.sendMessage(
        chatId,
        "✅ <b>¡SOS ENVIADO!</b>\n\nLa alerta ha sido enviada al centro de mando y registrada en el mapa."
      );
    } catch (err) {
      console.error("Error enviando SOS:", err);
      await client.sendMessage(chatId, "❌ Error al enviar la alerta.");
    } finally {
      await clearSession(db, telegramId);
    }
  }
}
