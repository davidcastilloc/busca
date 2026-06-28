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
    if (session && session.step.startsWith("rep_")) {
      await handleReportState(client, db, chatId, telegramId, session, text, msg.photo, env);
      return;
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
  helpText += `📍 <b>Enviar Ubicación GPS</b> - Adjunta tu ubicación al chat para ver los centros de ayuda (albergues/acopio) más cercanos.\n`;
  helpText += `📷 <b>Enviar Foto de Flyer</b> - Envía una imagen con el código QR del cartel para decodificarlo al instante.\n\n`;

  if (isAdmin) {
    helpText += `🔑 <b>Acciones de Voluntario (Autorizado):</b>\n`;
    helpText += `📋 /inventario [centro] - Administrar stock de insumos de un centro de ayuda.`;
  }

  await client.sendMessage(chatId, helpText);
}
