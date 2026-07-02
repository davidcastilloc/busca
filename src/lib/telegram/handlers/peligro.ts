import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";
import { resolveLocation, getDistance } from "../utils";

export async function startPeligro(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  await setSession(db, telegramId, chatId, "pel_tipo", {});
  
  const keyboard = {
    keyboard: [
      [{ text: "🚧 Bloqueo de vía" }, { text: "⛰️ Derrumbe" }],
      [{ text: "🌊 Inundación" }, { text: "👮 Piquete Policial" }],
      [{ text: "🤜 Altercado" }, { text: "💔 Saqueo" }],
      [{ text: "/cancelar" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await client.sendMessage(
    chatId,
    "🚧 <b>Reporte de Zonas de Peligro</b>\n\n¿Qué tipo de peligro deseas reportar en la vía?",
    { reply_markup: keyboard }
  );
}

export async function handlePeligroState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  location?: { latitude: number; longitude: number }
): Promise<void> {
  const currentStep = session.step;
  const data = session.data || {};

  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Reporte de peligro cancelado.", {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  // 1. Tipo de Peligro
  if (currentStep === "pel_tipo") {
    if (!text) {
      await client.sendMessage(chatId, "⚠️ Por favor selecciona una opción del teclado.");
      return;
    }
    
    let tipo = "";
    if (text.includes("Bloqueo")) tipo = "bloqueo";
    else if (text.includes("Derrumbe")) tipo = "derrumbe";
    else if (text.includes("Inundación")) tipo = "inundacion";
    else if (text.includes("Piquete")) tipo = "piquete";
    else if (text.includes("Altercado")) tipo = "altercado";
    else if (text.includes("Saqueo")) tipo = "saqueo";
    
    if (!tipo) {
      await client.sendMessage(chatId, "⚠️ Opción no válida. Elige del teclado:");
      return;
    }

    data.tipo_peligro = tipo;
    await setSession(db, telegramId, chatId, "pel_descripcion", data);
    await client.sendMessage(
      chatId,
      `📝 Has seleccionado: <b>${text}</b>\n\nDescribe brevemente la situación (gravedad, si impide el paso de camiones, etc.):`,
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // 2. Descripción
  if (currentStep === "pel_descripcion") {
    if (!text || text.trim().length < 5) {
      await client.sendMessage(chatId, "⚠️ Por favor describe la situación de forma más detallada (mínimo 5 letras):");
      return;
    }
    data.descripcion = text.trim();
    await setSession(db, telegramId, chatId, "pel_ubicacion", data);
    
    const gpsKeyboard = {
      keyboard: [
        [{ text: "📍 Compartir mi ubicación actual (GPS)", request_location: true }],
        [{ text: "/cancelar" }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    
    await client.sendMessage(
      chatId,
      "📍 ¿Dónde está ocurriendo este peligro?\n\nComparte tu <b>ubicación GPS</b> usando el botón de abajo o escribe el nombre de la calle/sector:",
      { reply_markup: gpsKeyboard }
    );
    return;
  }

  // 3. Ubicación
  if (currentStep === "pel_ubicacion") {
    const resolved = await resolveLocation(db, text, location);
    
    if (!resolved.valid || !resolved.latitud || !resolved.longitud) {
      await client.sendMessage(chatId, "⚠️ Coordenadas requeridas para registrar el peligro. Por favor comparte tu ubicación GPS exacta usando el botón:");
      return;
    }

    data.ubicacion_nombre = resolved.ubicacion_nombre;
    data.latitud = resolved.latitud;
    data.longitud = resolved.longitud;

    try {
      const dangerId = "peligro-" + crypto.randomUUID();
      const timestamp = Math.floor(Date.now() / 1000);

      // Guardar en zonas_peligro
      await db.prepare(`
        INSERT INTO zonas_peligro (id, telegram_user_id, tipo_peligro, descripcion, latitud, longitud, activo, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(
        dangerId,
        String(telegramId),
        data.tipo_peligro,
        `${data.descripcion} (Sector: ${data.ubicacion_nombre})`,
        data.latitud,
        data.longitud,
        timestamp
      ).run();

      await client.sendMessage(
        chatId,
        "✅ <b>¡REPORTE DE PELIGRO REGISTRADO!</b>\n\nSe ha colocado la advertencia en el mapa web para todos los conductores y voluntarios.",
        { reply_markup: { remove_keyboard: true } }
      );

      // Notificar a voluntarios suscritos cercanos (radio de 10km) inmediatamente
      await notificarVoluntariosCercanos(client, db, dangerId, data.tipo_peligro, data.descripcion, data.ubicacion_nombre, data.latitud, data.longitud);

    } catch (err) {
      console.error("Error al registrar peligro en D1:", err);
      await client.sendMessage(chatId, "❌ Error técnico al guardar el reporte.", {
        reply_markup: { remove_keyboard: true }
      });
    } finally {
      await clearSession(db, telegramId);
    }
  }
}

async function notificarVoluntariosCercanos(
  client: TelegramClient,
  db: D1Database,
  dangerId: string,
  tipo: string,
  desc: string,
  sector: string,
  lat: number,
  lon: number
): Promise<void> {
  try {
    // 10km ~ 0.09 grados de latitud/longitud para bounding box rápido
    const radiusGrad = 0.09;
    
    // Obtener suscriptores activos en el bounding box
    const { results } = await db.prepare(`
      SELECT telegram_chat_id, latitud, longitud, radio_km 
      FROM alertas_suscripciones 
      WHERE activo = 1
        AND latitud BETWEEN ?1 - ?3 AND ?1 + ?3
        AND longitud BETWEEN ?2 - ?3 AND ?2 + ?3
    `).bind(lat, lon, radiusGrad).all<any>();

    if (!results || results.length === 0) return;

    const emojiMap: Record<string, string> = {
      bloqueo: "🚧 Bloqueo de vía",
      derrumbe: "⛰️ Derrumbe",
      inundacion: "🌊 Inundación",
      piquete: "👮 Piquete Policial/Militar",
      altercado: "🤜 Altercado / Conflicto civil",
      saqueo: "💔 Saqueo"
    };

    const alertMessage = `⚠️ <b>¡NUEVO PELIGRO REPORTADO EN TU ZONA!</b> ⚠️\n\n` +
      `📌 <b>Tipo:</b> ${emojiMap[tipo] || tipo}\n` +
      `📍 <b>Sector:</b> ${sector}\n` +
      `📝 <b>Detalle:</b> ${desc}\n\n` +
      `🔗 <a href="https://dondeestan.org/mapa?tipo=peligro&id=${dangerId}">Ver en el mapa</a>\n\n` +
      `🚗 <i>Evita transitar por esta zona si estás en ruta de entrega.</i>`;

    for (const sub of results) {
      const dist = getDistance(lat, lon, sub.latitud, sub.longitud);
      if (dist <= (sub.radio_km || 10.0)) {
        try {
          await client.sendMessage(sub.telegram_chat_id, alertMessage);
          await client.sendLocation(sub.telegram_chat_id, lat, lon);
        } catch (e) {
          // ignore dead chats
        }
      }
    }
  } catch (error) {
    console.error("Error al notificar voluntarios sobre peligro:", error);
  }
}
