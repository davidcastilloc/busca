import type { TelegramClient } from "../client";
import { setSession, clearSession, type TelegramSession } from "../session";

export async function startLogin(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number
): Promise<void> {
  // Inicializar flujo conversacional de login
  await setSession(db, telegramId, chatId, "log_waiting_contact", {});

  await client.sendMessage(
    chatId,
    "👤 <b>Identificación de Voluntario</b>\n\nPara verificar tu identidad, por favor presiona el botón de abajo <b>\"📱 Compartir mi número de teléfono\"</b>.\n\n<i>Escribe /cancelar en cualquier momento para abortar.</i>",
    {
      reply_markup: {
        keyboard: [
          [
            {
              text: "📱 Compartir mi número de teléfono",
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

export async function handleLoginState(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  telegramId: string | number,
  session: TelegramSession,
  text?: string,
  contact?: any
): Promise<void> {
  if (text === "/cancelar") {
    await clearSession(db, telegramId);
    await client.sendMessage(chatId, "❌ Identificación cancelada.", {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  // Verificar si recibimos un contacto
  if (!contact) {
    await client.sendMessage(
      chatId,
      "⚠️ Por favor, utiliza el botón de abajo para compartir tu contacto o escribe /cancelar:",
      {
        reply_markup: {
          keyboard: [
            [
              {
                text: "📱 Compartir mi número de teléfono",
                request_contact: true,
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }

  // VALIDACIÓN DE SEGURIDAD 1: Verificar que el contacto pertenezca al remitente real
  // Si contact.user_id no coincide con el telegramId del remitente, significa que adjuntó el contacto de otra persona manualmente.
  if (contact.user_id && String(contact.user_id) !== String(telegramId)) {
    await client.sendMessage(
      chatId,
      "🚷 <b>Error de Seguridad</b>\n\nSolo puedes compartir tu propio número de teléfono para identificarte. Por favor, vuelve a intentarlo usando el botón oficial de compartir contacto.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
    await clearSession(db, telegramId);
    return;
  }

  const rawPhone = contact.phone_number;
  if (!rawPhone) {
    await client.sendMessage(chatId, "❌ No se pudo leer el número de teléfono desde el contacto compartido.", {
      reply_markup: { remove_keyboard: true },
    });
    await clearSession(db, telegramId);
    return;
  }

  // Limpiar y normalizar el teléfono de Telegram (ej. +584127654321 -> 584127654321)
  const cleanedPhone = rawPhone.replace(/[^0-9]/g, "").trim();

  // Obtener los últimos 10 dígitos (ej. 4127654321) para comparar independientemente del formato de país o prefijos
  const last10Digits = cleanedPhone.substring(cleanedPhone.length - 10);

  if (last10Digits.length < 10) {
    await client.sendMessage(chatId, "❌ El número de teléfono compartido no tiene un formato válido.", {
      reply_markup: { remove_keyboard: true },
    });
    await clearSession(db, telegramId);
    return;
  }

  try {
    // Buscar voluntario en D1 usando coincidencia exacta o sufijo LIKE
    const queryPhonePattern = `%${last10Digits}`;
    const voluntario = await db
      .prepare(
        "SELECT id, nombre, telefono FROM voluntarios WHERE (telefono = ? OR telefono LIKE ?) AND activo = 1"
      )
      .bind(cleanedPhone, queryPhonePattern)
      .first<{ id: number; nombre: string; telefono: string }>();

    if (!voluntario) {
      await client.sendMessage(
        chatId,
        `❌ <b>Número no registrado</b>\n\nEl número de teléfono <b>+${cleanedPhone}</b> no está registrado como voluntario activo en nuestra plataforma web.\n\nPor favor, regístrate primero en <a href="https://dondeestan.org/ayudar">dondeestan.org/ayudar</a> e intenta de nuevo.`,
        {
          reply_markup: { remove_keyboard: true },
          parse_mode: "HTML",
        }
      );
      await clearSession(db, telegramId);
      return;
    }

    // Vincular telegram_id
    // Desvincular si este telegram_id ya estaba asociado a otra cuenta (limpieza preventiva)
    await db.prepare("UPDATE voluntarios SET telegram_id = NULL WHERE telegram_id = ?").bind(String(telegramId)).run();

    // Guardar vinculación
    await db
      .prepare("UPDATE voluntarios SET telegram_id = ? WHERE id = ?")
      .bind(String(telegramId), voluntario.id)
      .run();

    await client.sendMessage(
      chatId,
      `✅ <b>¡Identificación Exitosa!</b>\n\nHola, <b>${voluntario.nombre}</b>. Tu cuenta web vinculada es el teléfono <code>${voluntario.telefono}</code>.\n\nYa estás registrado como voluntario activo en Telegram. Puedes usar todos los comandos del menú de rescate.`,
      {
        reply_markup: { remove_keyboard: true },
        parse_mode: "HTML",
      }
    );

    // Actualizar el menú de comandos nativo específicamente para este usuario
    try {
      await client.setMyCommands([
        { command: "buscar", description: "Buscar persona en el censo" },
        { command: "reportar", description: "Reportar persona desaparecida" },
        { command: "login", description: "Identificarte como voluntario" },
        { command: "inventario", description: "Administrar stock de insumos" },
        { command: "encontrado", description: "Marcar persona como localizado" },
        { command: "censo", description: "Leer lista de nombres con IA" },
        { command: "refugio", description: "Actualizar capacidad de un refugio" },
        { command: "urgencia", description: "Alerta critica de necesidad en terreno" },
        { command: "cubierta", description: "Marcar una necesidad como cubierta" },
        { command: "peligro", description: "Reportar peligro en la via (bloqueo)" },
        { command: "alerta", description: "Suscribirse a alertas GPS (radio 10km)" },
        { command: "acopio", description: "Abrir Dashboard del Centro de Acopio" }
      ], { type: "chat", chat_id: chatId });

      await client.setChatMenuButton(chatId, {
        type: "web_app",
        text: "🗺️ Mapa Voluntarios",
        web_app: {
          url: "https://dondeestan.org/mapa"
        }
      });
    } catch (cmdErr) {
      console.error("Error al setear comandos o botón personalizado:", cmdErr);
    }
  } catch (err) {
    console.error("Error al procesar login de contacto:", err);
    await client.sendMessage(chatId, "❌ Error de conexión al validar tu voluntariado en la base de datos.", {
      reply_markup: { remove_keyboard: true },
    });
  } finally {
    await clearSession(db, telegramId);
  }
}
