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

    // Verificar si el usuario es Admin/Voluntario
    const adminIds = (env.TELEGRAM_ADMIN_IDS || "").split(",").map((id) => id.trim());
    const isAdmin = adminIds.includes(String(telegramId));

    try {
      if (!isAdmin) {
        await client.answerCallbackQuery(cb.id, {
          text: "🚷 No tienes permisos para esta acción.",
          show_alert: true,
        });
        return;
      }

      // Procesar rutas de callback de inventario
      if (data.startsWith("ref:")) {
        const refugioId = data.split(":")[1];
        // Buscar nombre
        const r = await db
          .prepare("SELECT nombre FROM refugios WHERE id = ?")
          .bind(refugioId)
          .first<any>();
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
        await handleShelterStatusUpdate(client, db, chatId, refugioId, parseInt(porcentaje), messageId);
      } else if (data === "ref_list") {
        await handleRefugioList(client, chatId, messageId, db);
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

    // Verificar si es Admin
    const adminIds = (env.TELEGRAM_ADMIN_IDS || "").split(",").map((id) => id.trim());
    const isAdmin = adminIds.includes(String(telegramId));

    // Obtener sesión
    const session = await getSession(db, telegramId);

    // Si tiene sesión activa en un flujo conversacional
    if (session) {
      if (session.step.startsWith("rep_")) {
        await handleReportState(client, db, chatId, telegramId, session, text, msg.photo, env);
        return;
      }
      if (session.step.startsWith("fnd_")) {
        await handleFoundState(client, db, chatId, telegramId, session, text, msg.photo, env);
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
        await handleSosState(client, db, chatId, telegramId, session, text, env);
        return;
      }
      if (session.step.startsWith("brd_")) {
        await handleBroadcastState(client, db, chatId, telegramId, isAdmin, session, text);
        return;
      }
    }

    // Comandos base
    if (text) {
      const lowerText = text.toLowerCase();
      if (lowerText === "/start" || lowerText === "/help" || lowerText === "/ayuda") {
        await sendWelcomeMessage(client, chatId, isAdmin);
        return;
      }

      if (lowerText.startsWith("/buscar")) {
        const query = text.substring(7).trim();
        await handleSearch(client, db, chatId, query);
        return;
      }

      if (lowerText.startsWith("/inventario")) {
        const args = text.substring(11).trim();
        await handleInventory(client, db, chatId, isAdmin, args);
        return;
      }

      if (lowerText === "/reportar") {
        await startReport(client, db, chatId, telegramId);
        return;
      }

      if (lowerText.startsWith("/encontrado")) {
        const args = text.substring(11).trim();
        await startFound(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/censo")) {
        const args = text.substring(6).trim();
        await startCensus(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/refugio")) {
        const args = text.substring(8).trim();
        await startShelter(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/urgencia") || lowerText.startsWith("/sos")) {
        const args = text.replace(/^\/(urgencia|sos)/i, "").trim();
        await startSos(client, db, chatId, telegramId, args);
        return;
      }

      if (lowerText.startsWith("/alerta") || lowerText.startsWith("/broadcast")) {
        const args = text.replace(/^\/(alerta|broadcast)/i, "").trim();
        await startBroadcast(client, db, chatId, telegramId, isAdmin, args);
        return;
      }
    }

    // Ubicación GPS enviada
    if (msg.location) {
      await handleLocation(client, db, chatId, msg.location.latitude, msg.location.longitude);
      return;
    }

    // Foto enviada sin comando anterior
    if (msg.photo) {
      await handleMediaMessage(client, db, chatId, msg.photo);
      return;
    }

    // Mensaje no reconocido
    await sendWelcomeMessage(client, chatId, isAdmin);
  }
}

async function sendWelcomeMessage(
  client: TelegramClient,
  chatId: string | number,
  isAdmin: boolean
): Promise<void> {
  let helpText = `👋 <b>Bienvenido al Bot de dondeestan.org</b>\n\n`;
  helpText += `Este bot te permite acceder y actualizar información de personas y centros en tiempo real.\n\n`;
  helpText += `<b>Comandos disponibles:</b>\n`;
  helpText += `🔍 /buscar [nombre/cédula] - Buscar persona en el censo.\n`;
  helpText += `🚨 /reportar - Reportar una persona desaparecida.\n`;
  helpText += `✅ /encontrado [cédula] - Marcar persona como a salvo.\n`;
  helpText += `📷 /censo - Leer lista de nombres de papel con IA.\n`;
  helpText += `⛺ /refugio - Actualizar capacidad de un refugio.\n`;
  helpText += `🆘 /urgencia [insumo] - Alerta crítica de necesidad en terreno.\n\n`;
  helpText += `📍 <b>Enviar Ubicación GPS</b> - Adjunta tu ubicación para ver centros cercanos.\n`;
  helpText += `📷 <b>Enviar Foto de Flyer</b> - Decodificar un código QR.\n\n`;

  if (isAdmin) {
    helpText += `🔑 <b>Acciones de Admin/Comando:</b>\n`;
    helpText += `📋 /inventario [centro] - Administrar stock de insumos.\n`;
    helpText += `📢 /alerta [mensaje] - Enviar broadcast global a voluntarios.\n`;
  }

  await client.sendMessage(chatId, helpText);
}
