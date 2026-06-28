import type { TelegramClient } from "../client";

export async function handleMediaMessage(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  photoArray: any[]
): Promise<void> {
  if (!photoArray || photoArray.length === 0) return;

  try {
    await client.sendMessage(chatId, "🔍 Procesando imagen enviada para buscar códigos QR...");

    // 1. Obtener la foto de mayor tamaño
    const sortedPhotos = photoArray.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    const fileId = sortedPhotos[0].file_id;

    // 2. Obtener ruta del archivo desde Telegram
    const fileInfo = await client.getFile(fileId);
    const filePath = fileInfo.file_path;

    // 3. Descargar la foto como Blob
    const blob = await client.downloadFile(filePath);

    // 4. Enviar a la API externa de qrserver para decodificar
    const formData = new FormData();
    formData.append("file", blob, "photo.jpg");

    const qrResponse = await fetch("https://api.qrserver.com/v1/read-qr-code/", {
      method: "POST",
      body: formData,
    });

    if (!qrResponse.ok) {
      throw new Error(`QR API HTTP error: ${qrResponse.status}`);
    }

    const qrData = (await qrResponse.json()) as any;

    // 5. Analizar el resultado
    let detectedData: string | null = null;
    if (Array.isArray(qrData) && qrData[0]?.symbol?.[0]) {
      const symbol = qrData[0].symbol[0];
      if (symbol.data && !symbol.error) {
        detectedData = symbol.data;
      }
    }

    if (!detectedData) {
      await client.sendMessage(
        chatId,
        "📷 No se detectó ningún código QR en la imagen.\n\n<i>Si quieres iniciar un reporte de desaparición, escribe /reportar.</i>"
      );
      return;
    }

    await client.sendMessage(chatId, `🎯 Código QR decodificado:\n<code>${detectedData}</code>\n\nBuscando información...`);

    // 6. Validar si es enlace de flyer
    const flyerMatch = detectedData.match(/\/flyer\/([a-zA-Z0-9_-]+)/);
    if (!flyerMatch) {
      await client.sendMessage(
        chatId,
        `⚠️ El código QR no corresponde a un cartel de dondeestan.org.\nContenido decodificado:\n<code>${detectedData}</code>`
      );
      return;
    }

    const flyerId = flyerMatch[1];

    // 7. Buscar flyer en D1
    const flyer = await db
      .prepare("SELECT * FROM flyers WHERE id = ?")
      .bind(flyerId)
      .first<any>();

    if (!flyer) {
      await client.sendMessage(
        chatId,
        `❌ El cartel con ID <code>${flyerId}</code> no se encuentra en nuestra base de datos. Puede haber sido retirado.`
      );
      return;
    }

    // Parsear teléfonos y redes
    let phones: string[] = [];
    let socials: string[] = [];
    try {
      if (flyer.phones) phones = JSON.parse(flyer.phones);
      if (flyer.socials) socials = JSON.parse(flyer.socials);
    } catch (e) {
      // ignore
    }

    let responseText = `🚨 <b>Cartel de Búsqueda Activo: ${flyer.title}</b>\n\n`;
    responseText += `📝 <b>Detalles:</b>\n${flyer.description}\n\n`;

    if (phones.length > 0) {
      responseText += `📞 <b>Llamar a:</b>\n${phones.map((p) => `• <code>${p}</code>`).join("\n")}\n\n`;
    }

    if (socials.length > 0) {
      responseText += `📱 <b>Redes Sociales:</b>\n${socials.map((s) => `• ${s}`).join("\n")}\n\n`;
    }

    responseText += `🔗 <a href="${detectedData}">Ver cartel digital completo</a>`;

    await client.sendMessage(chatId, responseText, {
      disable_web_page_preview: false,
    });
  } catch (error: any) {
    console.error("handleMediaMessage error:", error);
    await client.sendMessage(
      chatId,
      "❌ Ocurrió un error al procesar el código QR de la imagen."
    );
  }
}
