import type { TelegramClient } from "../client";
import { CATEGORIAS_INVENTARIO, TODOS_LOS_ITEMS } from "../../items";

// Mapeo de estados de inventario
const STATUS_MAP: Record<string, string> = {
  est: "Estable",
  baj: "Bajo",
  cri: "Crítico",
  exc: "Exceso",
};

const EMOJI_MAP: Record<string, string> = {
  est: "🟢 Estable",
  baj: "🟡 Bajo",
  cri: "🔴 Crítico",
  exc: "🔵 Exceso",
};

export async function handleInventory(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  isAdmin: boolean,
  args?: string
): Promise<void> {
  if (!isAdmin) {
    await client.sendMessage(
      chatId,
      "🚷 Acceso denegado. Este comando es solo para rescatistas y voluntarios autorizados."
    );
    return;
  }

  const query = args?.trim();

  try {
    let refugios: any[] = [];
    if (query) {
      const res = await db
        .prepare("SELECT id, nombre FROM refugios WHERE nombre LIKE ? LIMIT 5")
        .bind(`%${query}%`)
        .all();
      refugios = res.results || [];
    } else {
      const res = await db
        .prepare("SELECT id, nombre FROM refugios ORDER BY nombre LIMIT 5")
        .all();
      refugios = res.results || [];
    }

    if (refugios.length === 0) {
      await client.sendMessage(
        chatId,
        query
          ? `❌ No se encontró ningún centro que coincida con "<b>${query}</b>".`
          : "❌ No hay centros registrados en la base de datos."
      );
      return;
    }

    if (refugios.length === 1 || query) {
      // Si solo hay un resultado coincidente o es una coincidencia directa, mostramos categorías de ese refugio
      const r = refugios[0];
      await sendCategories(client, chatId, r.id, r.nombre);
      return;
    }

    // Listar refugios disponibles
    const keyboard = refugios.map((r) => [
      {
        text: r.nombre,
        callback_data: `ref:${r.id}`,
      },
    ]);

    await client.sendMessage(chatId, "📋 <b>Selecciona el centro para actualizar inventario:</b>", {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error("handleInventory error:", error);
    await client.sendMessage(chatId, "❌ Error al cargar los centros de ayuda.");
  }
}

// Enviar categorías del inventario
export async function sendCategories(
  client: TelegramClient,
  chatId: string | number,
  refugioId: number | string,
  refugioNombre: string,
  messageId?: number
): Promise<void> {
  const keyboard = CATEGORIAS_INVENTARIO.map((cat, idx) => [
    {
      text: cat.nombre,
      callback_data: `c:${refugioId}:${idx}`,
    },
  ]);

  // Agregar botón para volver a seleccionar refugio si es necesario
  keyboard.push([
    {
      text: "🔙 Cambiar Centro",
      callback_data: `ref_list`,
    },
  ]);

  const text = `🏢 <b>Centro:</b> ${refugioNombre}\n\nSelecciona una categoría de inventario para gestionar:`;

  if (messageId) {
    await client.editMessageText(chatId, messageId, text, {
      reply_markup: { inline_keyboard: keyboard },
    });
  } else {
    await client.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}

// Enviar items de una categoría
export async function sendCategoryItems(
  client: TelegramClient,
  chatId: string | number,
  refugioId: number | string,
  catIdx: number,
  messageId: number,
  db: D1Database
): Promise<void> {
  const category = CATEGORIAS_INVENTARIO[catIdx];
  if (!category) return;

  // Cargar estado actual de inventario para mostrarlo en el botón
  let currentInv: Record<string, string> = {};
  try {
    const res = await db
      .prepare("SELECT inventario, nombre FROM refugios WHERE id = ?")
      .bind(refugioId)
      .first<any>();

    if (res && res.inventario) {
      currentInv = typeof res.inventario === "string" ? JSON.parse(res.inventario) : res.inventario;
    }
  } catch (e) {
    console.error("Error fetching current inventory state:", e);
  }

  const keyboard: any[][] = [];

  category.items.forEach((item) => {
    const currentStatus = currentInv[item.id] || "Estable";
    const statusEmoji = {
      "Estable": "🟢",
      "Bajo": "🟡",
      "Crítico": "🔴",
      "Exceso": "🔵",
    }[currentStatus] || "⚪";

    keyboard.push([
      {
        text: `${statusEmoji} ${item.nombre}`,
        callback_data: `i:${refugioId}:${item.id}`,
      },
    ]);
  });

  // Botón para volver a categorías
  keyboard.push([
    {
      text: "🔙 Volver a Categorías",
      callback_data: `ref:${refugioId}`,
    },
  ]);

  const text = `📁 <b>Categoría:</b> ${category.nombre}\n\nSelecciona el ítem que deseas actualizar:`;

  await client.editMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// Enviar selección de estado para un item
export async function sendItemStatusOptions(
  client: TelegramClient,
  chatId: string | number,
  refugioId: number | string,
  itemId: string,
  messageId: number,
  db: D1Database
): Promise<void> {
  const item = TODOS_LOS_ITEMS.find((i) => i.id === itemId);
  if (!item) return;

  // Obtener nombre del refugio y estado actual del item
  let refugioNombre = "";
  let currentStatus = "Estable";
  try {
    const res = await db
      .prepare("SELECT nombre, inventario FROM refugios WHERE id = ?")
      .bind(refugioId)
      .first<any>();
    if (res) {
      refugioNombre = res.nombre;
      if (res.inventario) {
        const inv = typeof res.inventario === "string" ? JSON.parse(res.inventario) : res.inventario;
        currentStatus = inv[itemId] || "Estable";
      }
    }
  } catch (e) {
    console.error(e);
  }

  const keyboard = [
    [
      { text: EMOJI_MAP.est, callback_data: `s:${refugioId}:${itemId}:est` },
      { text: EMOJI_MAP.baj, callback_data: `s:${refugioId}:${itemId}:baj` },
    ],
    [
      { text: EMOJI_MAP.cri, callback_data: `s:${refugioId}:${itemId}:cri` },
      { text: EMOJI_MAP.exc, callback_data: `s:${refugioId}:${itemId}:exc` },
    ],
    [
      {
        text: "🔙 Cancelar",
        // Volver a la categoría correspondiente
        callback_data: `back_to_cat:${refugioId}:${itemId}`,
      },
    ],
  ];

  const text = `🏢 <b>Centro:</b> ${refugioNombre}\n📦 <b>Ítem:</b> ${item.nombre}\n⚡ <b>Estado actual:</b> ${currentStatus}\n\nSelecciona el nuevo estado de inventario:`;

  await client.editMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

// Procesar el cambio de estado de un item
export async function setItemStatus(
  client: TelegramClient,
  chatId: string | number,
  refugioId: number | string,
  itemId: string,
  statusCode: string,
  messageId: number,
  db: D1Database
): Promise<void> {
  const item = TODOS_LOS_ITEMS.find((i) => i.id === itemId);
  const statusName = STATUS_MAP[statusCode];
  if (!item || !statusName) return;

  try {
    // 1. Obtener refugio e inventario actual
    const res = await db
      .prepare("SELECT nombre, inventario FROM refugios WHERE id = ?")
      .bind(refugioId)
      .first<any>();

    if (!res) {
      await client.sendMessage(chatId, "❌ Refugio no encontrado.");
      return;
    }

    let inv: Record<string, string> = {};
    if (res.inventario) {
      try {
        inv = typeof res.inventario === "string" ? JSON.parse(res.inventario) : res.inventario;
      } catch (e) {
        inv = {};
      }
    }

    // 2. Modificar el estado del item
    inv[itemId] = statusName;

    // 3. Guardar en BD
    await db
      .prepare("UPDATE refugios SET inventario = ?, updated_at = datetime('now', '-4 hours') WHERE id = ?")
      .bind(JSON.stringify(inv), refugioId)
      .run();

    // 4. Confirmar y volver a la categoría
    const catIdx = CATEGORIAS_INVENTARIO.findIndex((cat) =>
      cat.items.some((i) => i.id === itemId)
    );

    // Mensaje de éxito flash
    await client.sendMessage(
      chatId,
      `✅ Actualizado: <b>${item.nombre}</b> ahora está <b>${statusName}</b> en <i>${res.nombre}</i>.`
    );

    // Redirigir la interfaz inline de vuelta a los items de la categoría
    if (catIdx !== -1) {
      await sendCategoryItems(client, chatId, refugioId, catIdx, messageId, db);
    } else {
      await sendCategories(client, chatId, refugioId, res.nombre, messageId);
    }
  } catch (error) {
    console.error("setItemStatus error:", error);
    await client.sendMessage(chatId, "❌ Error al guardar el nuevo estado de inventario.");
  }
}

// Volver a la lista de refugios
export async function handleRefugioList(
  client: TelegramClient,
  chatId: string | number,
  messageId: number,
  db: D1Database
): Promise<void> {
  try {
    const res = await db
      .prepare("SELECT id, nombre FROM refugios ORDER BY nombre LIMIT 5")
      .all();
    const refugios = res.results || [];

    const keyboard = refugios.map((r) => [
      {
        text: r.nombre,
        callback_data: `ref:${r.id}`,
      },
    ]);

    await client.editMessageText(chatId, messageId, "📋 <b>Selecciona el centro para actualizar inventario:</b>", {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error(error);
  }
}
