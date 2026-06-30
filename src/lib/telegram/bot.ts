import { TelegramClient } from "./client";
import { getSession } from "./session";
import { handleSearch } from "./handlers/search";
import {
  handleInventory,
  sendCategories,
  sendCategoryItems,
  sendItemStatusOptions,
  setItemStatus,
  handleRefugioList,
} from "./handlers/inventory";
import { startReport, handleReportState } from "./handlers/report";
import { handleLocation } from "./handlers/location";
import { handleMediaMessage } from "./handlers/media";
import { CATEGORIAS_INVENTARIO } from "../items";

import { startFound, handleFoundState } from "./handlers/found";
import { startCensus, handleCensusState } from "./handlers/census";
import { startShelter, handleShelterState, handleShelterSelection, handleShelterStatusUpdate } from "./handlers/shelter";
import { startSos, handleSosState } from "./handlers/sos";
import { startBroadcast, handleBroadcastState } from "./handlers/broadcast";
import { startLogin, handleLoginState } from "./handlers/login";
import { startPeligro, handlePeligroState } from "./handlers/peligro";
import { startAlerta, handleAlertaState } from "./handlers/alerta";
import { handleAcopio } from "./handlers/acopio";

// Helper para verificar si un ID de Telegram pertenece a un voluntario activo o admin
async function checkIsVolunteerOrAdmin(
  db: D1Database,
  telegramId: string | number,
  adminIdsEnv?: string
): Promise<boolean> {
  const adminIds = (adminIdsEnv || "").split(",").map((id) => id.trim());
  if (adminIds.includes(String(telegramId))) {
    return true;
  }
  try {
    const vol = await db
      .prepare("SELECT id FROM voluntarios WHERE telegram_id = ? AND activo = 1")
      .bind(String(telegramId))
      .first<{ id: number }>();
    return !!vol;
  } catch (err) {
    console.error("Error al verificar autorización de voluntario en D1:", err);
    return false;
  }
}

export async function processTelegramUpdate(
  update: any,
  env: {
    DB: D1Database;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_ADMIN_IDS?: string;
    FOTOS_BUCKET: R2Bucket;
    CENSO_QUEUE: Queue;
  }
): Promise<void> {
  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const db = env.DB;

  // 1. Identificar origen de callback_query
  if (update.callback_query) {
    const cb = update.callback_query;
    const telegramId = cb.from.id;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data;

    // Verificar si el usuario es Admin o Voluntario autorizado
    const isAuthorized = await checkIsVolunteerOrAdmin(db, telegramId, env.TELEGRAM_ADMIN_IDS);

    try {
      if (!isAuthorized) {
        await client.answerCallbackQuery(cb.id, {
          text: "🚷 No tienes permisos para esta acción. Inicia sesión con /login.",
          show_alert: true,
        });
        return;
      }

      // Procesar rutas de callback de inventario
      if (data.startsWith("ref:")) {
        const refugioId = data.split(":")[1];
        // Buscar nombre
        const query = `
          SELECT nombre FROM (
            SELECT id, nombre FROM refugios
            UNION ALL
            SELECT id, nombre FROM centros_acopio
          ) WHERE id = ?
        `;
        const r = await db.prepare(query).bind(refugioId).first<any>();
        if (r) {
          await sendCategories(client, chatId, refugioId, r.nombre, messageId);
        }
      } else if (data.startsWith("c:")) {
        const [, refugioId, catIdx] = data.split(":");
        await sendCategoryItems(client, chatId, refugioId, parseInt(catIdx), messageId, db);
      } else if (data.startsWith("i:")) {
        const [, refugioId, itemId] = data.split(":");
        await sendItemStatusOptions(client, chatId, refugioId, itemId, messageId, db);
      } else if (data.startsWith("s:")) {
        const [, refugioId, itemId, statusCode] = data.split(":");
        await setItemStatus(client, chatId, refugioId, itemId, statusCode, messageId, db);
      } else if (data.startsWith("back_to_cat:")) {
        const [, refugioId, itemId] = data.split(":");
        const catIdx = CATEGORIAS_INVENTARIO.findIndex((cat) =>
          cat.items.some((i) => i.id === itemId)
        );
        if (catIdx !== -1) {
          await sendCategoryItems(client, chatId, refugioId, catIdx, messageId, db);
        }
      } else if (data.startsWith("shl_sel:")) {
        const refugioId = data.split(":")[1];
        await handleShelterSelection(client, db, chatId, refugioId, messageId);
      } else if (data.startsWith("shl_sta:")) {
        const [, refugioId, porcentaje] = data.split(":");
        await handleShelterStatusUpdate(client, db, chatId, telegramId, refugioId, parseInt(porcentaje), messageId);
      } else if (data === "ref_list") {
        await handleRefugioList(client, chatId, messageId, db);
      } else if (data.startsWith("cub:")) {
        const [, necesidadId] = data.split(":");
        try {
          const res = await db.prepare("UPDATE necesidades SET estado = 'atendida', updated_at = datetime('now', '-4 hours') WHERE id = ?").bind(necesidadId).run();
          if (res.meta.changes > 0) {
            await client.sendMessage(chatId, `✅ <b>¡Necesidad #${necesidadId} marcada como satisfecha!</b>`);
            await client.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
          } else {
            await client.sendMessage(chatId, `❌ No se encontró la necesidad o ya estaba marcada.`);
          }
        } catch (e) {
          await client.sendMessage(chatId, "❌ Ocurrió un error al actualizar la base de datos.");
        }
      }

      await client.answerCallbackQuery(cb.id);
    } catch (err) {
      console.error("Callback query processing error:", err);
      await client.answerCallbackQuery(cb.id, {
        text: "❌ Ocurrió un error al procesar el botón.",
        show_alert: true,
      });
    }
    return;
  }

  // 2. Identificar origen de mensaje normal
  if (update.message) {
    const msg = update.message;
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const isPrivate = msg.chat.type === "private";

    // Si agregaron al bot a un grupo
    if (msg.new_chat_members) {
      const welcomeGroupText = `👋 <b>¡Hola grupo!</b>\n\n` +
        `He sido agregado a este chat para asistir en la búsqueda y coordinación logística.\n\n` +
        `<b>Comandos permitidos en este grupo:</b>\n` +
        `🔍 /buscar [nombre/cédula] - Buscar persona en el censo.\n` +
        `📋 /necesidades - Listar necesidades abiertas.\n` +
        `✅ /cubierta [ID] - Marcar una necesidad como cubierta.\n\n` +
        `⚠️ <i>Nota: Para flujos interactivos (como /reportar, /login, /censo, /urgencia), por favor háblame por <b>chat privado</b> para no saturar este grupo.</i>`;
      await client.sendMessage(chatId, welcomeGroupText);
      return;
    }

    // Verificar permisos
    const adminIds = (env.TELEGRAM_ADMIN_IDS || "").split(",").map((id) => id.trim());
    const isAdmin = adminIds.includes(String(telegramId));
    const isAuthorized = await checkIsVolunteerOrAdmin(db, telegramId, env.TELEGRAM_ADMIN_IDS);

    // Obtener sesión (solo en chats privados para evitar interferir en grupos)
    const session = isPrivate ? await getSession(db, telegramId) : null;

    // Si tiene sesión activa en un flujo conversacional
    if (session) {
      if (session.step.startsWith("log_")) {
        await handleLoginState(client, db, chatId, telegramId, session, text, msg.contact);
        return;
      }
      if (session.step.startsWith("rep_")) {
        await handleReportState(client, db, chatId, telegramId, session, text, msg.photo, env, msg.location, isAuthorized);
        return;
      }
      if (session.step.startsWith("fnd_")) {
        await handleFoundState(client, db, chatId, telegramId, session, text, msg.photo, env, msg.location);
        return;
      }
      if (session.step.startsWith("cen_")) {
        await handleCensusState(client, db, chatId, telegramId, session, text, msg.photo, env);
        return;
      }
      if (session.step.startsWith("shl_")) {
        await handleShelterState(client, db, chatId, telegramId, session, text);
        return;
      }
      if (session.step.startsWith("sos_")) {
        await handleSosState(client, db, chatId, telegramId, session, text, msg.location, env);
        return;
      }
      if (session.step.startsWith("brd_")) {
        await handleBroadcastState(client, db, chatId, telegramId, isAdmin, session, text);
        return;
      }
      if (session.step.startsWith("pel_")) {
        await handlePeligroState(client, db, chatId, telegramId, session, text, msg.location);
        return;
      }
      if (session.step.startsWith("sub_")) {
        await handleAlertaState(client, db, chatId, telegramId, session, text, msg.location);
        return;
      }
    }

    // Comandos base
    if (text) {
      // Limpiar sufijo del bot (ej. /buscar@mi_bot -> /buscar)
      let cleanText = text;
      if (text.startsWith("/")) {
        const parts = text.split(" ");
        const commandPart = parts[0];
        if (commandPart.includes("@")) {
          const cleanCommand = commandPart.split("@")[0];
          parts[0] = cleanCommand;
          cleanText = parts.join(" ");
        }
      }
      const lowerText = cleanText.toLowerCase();

      // Restringir comandos interactivos de múltiples pasos en grupos
      if (!isPrivate) {
        const cmd = lowerText.split(" ")[0];
        const interactiveCommands = [
          "/login", "/reportar", "/encontrado", "/censo", 
          "/refugio", "/urgencia", "/sos", "/peligro", 
          "/alerta", "/broadcast"
        ];
        if (interactiveCommands.includes(cmd)) {
          await client.sendMessage(
            chatId,
            `⚠️ El comando <b>${cmd}</b> requiere interacción de varios pasos. Por favor, úsalo en un <b>chat privado</b> directo conmigo para no saturar el grupo.`
          );
          return;
        }
      }

      if (lowerText === "/start" || lowerText === "/help" || lowerText === "/ayuda") {
        await sendWelcomeMessage(client, chatId, isAuthorized, isAdmin);
        return;
      }

      if (lowerText.startsWith("/buscar")) {
        const query = cleanText.substring(7).trim();
        await handleSearch(client, db, chatId, query);
        return;
      }

      if (lowerText === "/login") {
        await startLogin(client, db, chatId, telegramId);
        return;
      }

      if (lowerText === "/reportar") {
        await startReport(client, db, chatId, telegramId);
        return;
      }

      // Comandos de Voluntarios (requieren isAuthorized)
      if (lowerText === "/misnecesidades" || lowerText === "/necesidades") {
        if (!isAuthorized) {
          await client.sendMessage(chatId, "🚷 Acceso denegado. Inicia sesión con /login.");
          return;
        }
        
        const q = `
          SELECT n.id, n.categoria, n.descripcion, n.gravedad, 
                 COALESCE(r.nombre, a.nombre, h.nombre, n.ubicacion_nombre) as ubicacion
          FROM necesidades n
          LEFT JOIN refugios r ON n.refugio_id = r.id
          LEFT JOIN centros_acopio a ON n.centro_acopio_id = a.id
          LEFT JOIN hospitales h ON n.hospital_id = h.id
          WHERE n.estado = 'abierta'
          ORDER BY n.created_at DESC
          LIMIT 10
        `;
        const { results } = await db.prepare(q).all<any>();
        
        if (!results || results.length === 0) {
          await client.sendMessage(chatId, "✅ No hay necesidades urgentes abiertas en este momento.");
          return;
        }
        
        await client.sendMessage(chatId, "📋 <b>Necesidades Abiertas:</b>\nSelecciona el botón de abajo si la necesidad ya fue satisfecha.");
        
        for (const n of results) {
          const gravEmoji = n.gravedad.toLowerCase().includes("alta") ? "🔴" : n.gravedad.toLowerCase().includes("media") ? "🟡" : "🔵";
          let textMsg = `${gravEmoji} <b>[${n.categoria}]</b> en <b>${n.ubicacion || 'Zona desconocida'}</b>\n📝 <i>"${n.descripcion}"</i>`;
          
          await client.sendMessage(chatId, textMsg, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Marcar como Satisfecha", callback_data: `cub:${n.id}` }]
              ]
            }
          });
        }
        return;
      }

      if (lowerText.startsWith("/inventario")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.substring(11).trim();
        await handleInventory(client, db, chatId, isAuthorized, args);
        return;
      }

      if (lowerText.startsWith("/encontrado")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.substring(11).trim();
        await startFound(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/censo")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.substring(6).trim();
        await startCensus(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/refugio")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.substring(8).trim();
        await startShelter(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/urgencia") || lowerText.startsWith("/sos")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.replace(/^\/(urgencia|sos)/i, "").trim();
        await startSos(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/cubierta")) {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        const args = text.substring(9).trim();
        if (!args) {
          await client.sendMessage(chatId, "⚠️ Formato incorrecto. Uso: /cubierta [ID_Necesidad]");
          return;
        }
        try {
          const res = await db.prepare("UPDATE necesidades SET estado = 'atendida', updated_at = datetime('now', '-4 hours') WHERE id = ?").bind(args).run();
          if (res.meta.changes > 0) {
            await client.sendMessage(chatId, `✅ <b>¡Necesidad #${args} marcada como cubierta!</b>\nGracias por mantener actualizada la información.`);
          } else {
            await client.sendMessage(chatId, `❌ No se encontró la necesidad con ID: ${args}`);
          }
        } catch (e) {
          await client.sendMessage(chatId, "❌ Ocurrió un error al actualizar la base de datos.");
        }
        return;
      }

      if (lowerText === "/peligro") {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        await startPeligro(client, db, chatId, telegramId);
        return;
      }

      if (lowerText === "/alerta") {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        await startAlerta(client, db, chatId, telegramId);
        return;
      }

      if (lowerText === "/acopio") {
        if (!isAuthorized) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es solo para voluntarios autorizados. Inicia sesión con /login."
          );
          return;
        }
        await handleAcopio(client, db, chatId, telegramId);
        return;
      }

      // Comandos de Admin (requieren isAdmin)
      if (lowerText.startsWith("/broadcast")) {
        if (!isAdmin) {
          await client.sendMessage(
            chatId,
            "🚷 Acceso denegado. Este comando es exclusivo para administradores globales."
          );
          return;
        }
        const args = text.replace(/^\/broadcast/i, "").trim();
        await startBroadcast(client, db, chatId, telegramId, isAdmin, args);
        return;
      }
    }

    // Ubicación GPS enviada
    if (msg.location) {
      await handleLocation(client, db, chatId, msg.location.latitude, msg.location.longitude);
      return;
    }

    // Contacto enviado sin flujo anterior
    if (msg.contact) {
      await client.sendMessage(
        chatId,
        "⚠️ Si deseas identificarte como voluntario, por favor inicia el flujo primero con el comando /login."
      );
      return;
    }

    // Foto enviada sin comando anterior
    if (msg.photo) {
      await handleMediaMessage(client, db, chatId, msg.photo);
      return;
    }

    // Mensaje no reconocido
    await sendWelcomeMessage(client, chatId, isAuthorized, isAdmin);
  }
}

async function sendWelcomeMessage(
  client: TelegramClient,
  chatId: string | number,
  isAuthorized: boolean,
  isAdmin: boolean
): Promise<void> {
  let helpText = `👋 <b>Bienvenido al Bot de dondeestan.org</b>\n\n`;
  helpText += `Este bot te permite acceder y actualizar información de personas y centros en tiempo real.\n\n`;
  helpText += `<b>Comandos públicos:</b>\n`;
  helpText += `🔍 /buscar [nombre/cédula] - Buscar persona en el censo.\n`;
  helpText += `🚨 /reportar - Reportar una persona desaparecida.\n`;
  helpText += `👤 /login - Identificarte como voluntario registrado.\n\n`;
  helpText += `📍 <b>Enviar Ubicación GPS</b> - Adjunta tu ubicación para ver centros cercanos.\n`;
  helpText += `📷 <b>Enviar Foto de Flyer</b> - Decodificar un código QR.\n\n`;

  if (isAuthorized) {
    helpText += `🤝 <b>Acciones de Voluntario:</b>\n`;
    helpText += `📋 /inventario [centro] - Administrar stock de insumos.\n`;
    helpText += `✅ /encontrado [cédula] - Marcar persona como localizado.\n`;
    helpText += `📷 /censo - Leer lista de nombres de papel con IA.\n`;
    helpText += `⛺ /refugio - Actualizar capacidad de un refugio.\n`;
    helpText += `🆘 /urgencia [insumo] - Alerta crítica de necesidad en terreno.\n`;
    helpText += `✅ /cubierta [ID] - Marcar una necesidad como cubierta.\n`;
    helpText += `📋 /misnecesidades - Listar necesidades abiertas para marcarlas.\n`;
    helpText += `🚧 /peligro - Reportar peligro en la vía (bloqueo/derrumbe).\n`;
    helpText += `🔔 /alerta - Suscribirse a alertas GPS (radio 10km).\n`;
    helpText += `📦 /acopio - Abrir Dashboard del Centro de Acopio.\n\n`;
  }

  if (isAdmin) {
    helpText += `🔑 <b>Acciones de Admin Global:</b>\n`;
    helpText += `📢 /alerta [mensaje] - Enviar broadcast global a voluntarios.\n`;
  }

  await client.sendMessage(chatId, helpText);
}
