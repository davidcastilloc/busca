import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { TelegramClient } from "../../lib/telegram/client";

export const prerender = false;

/** Envia notificacion al canal publico de Telegram si TELEGRAM_CHANNEL_ID esta configurado */
async function notifyChannel(
  cfEnv: any,
  flyerId: string,
  title: string,
  description: string,
  phones: string[]
): Promise<void> {
  const token = cfEnv.TELEGRAM_BOT_TOKEN;
  const channelId = cfEnv.TELEGRAM_CHANNEL_ID;
  if (!token || !channelId) return;

  try {
    const client = new TelegramClient(token);
    const flyerUrl = `https://dondeestan.org/flyer/${flyerId}`;

    // Determinar tipo a partir del título
    let emoji = "🚨";
    let tipoLabel = "EMERGENCIA";
    const titleUpper = title.toUpperCase();
    if (titleUpper.includes("BUSCA") || titleUpper.includes("DESAPAREC")) {
      emoji = "🔴"; tipoLabel = "SE BUSCA";
    } else if (titleUpper.includes("REFUGIO")) {
      emoji = "🏠"; tipoLabel = "REFUGIO ACTIVO";
    } else if (titleUpper.includes("EMERGENCIA") || titleUpper.includes("NECESIDAD")) {
      emoji = "🆘"; tipoLabel = "NECESIDAD CRÍTICA";
    } else if (titleUpper.includes("ENCONTRAD") || titleUpper.includes("SALVO")) {
      emoji = "✅"; tipoLabel = "PERSONA A SALVO";
    }

    // Descripción limpia sin etiquetas entre corchetes
    const descLimpia = description
      .replace(/\[.*?\]/g, "")
      .trim()
      .substring(0, 200);

    let msg = `${emoji} <b>${tipoLabel}: ${title}</b>\n\n`;
    if (descLimpia) msg += `${descLimpia}${descLimpia.length >= 200 ? "..." : ""}\n\n`;
    if (phones.length > 0) msg += `📞 <b>Contacto:</b> ${phones[0]}\n`;
    msg += `\n🔗 <a href="${flyerUrl}">${flyerUrl}</a>\n`;
    msg += `\n<i>— dondeestan.org | Red de Información de Emergencia</i>`;

    await client.sendMessage(channelId, msg, {
      link_preview_options: { is_disabled: false, url: flyerUrl }
    });
  } catch (err) {
    // No interrumpir el flujo principal si Telegram falla
    console.error("Error al notificar canal Telegram:", err);
  }
}

export const POST: APIRoute = async (context) => {
  try {
    const cfEnv = env as any;
    const { DB, FOTOS_BUCKET } = cfEnv;

    const body = await context.request.json();
    const { title, description, photo, foto_key: input_foto_key, phones, socials, registrarEnBusca, tipo } = body;

    if (!title || !description) {
      return new Response(JSON.stringify({ error: "Título y descripción son obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let foto_key = input_foto_key || "";

    if (photo && !foto_key) {
      // Procesar la foto en base64 para subirla a R2
      const parts = photo.split(",");
      const match = parts[0].match(/:(.*?);/);
      const mime = match ? match[1] : "image/jpeg";
      const base64Data = parts[1];
      
      // Decodificar base64
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileExt = mime.split("/")[1] || "jpg";
      foto_key = `flyers/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

      // Subir a R2
      await FOTOS_BUCKET.put(foto_key, bytes.buffer, {
        httpMetadata: { contentType: mime }
      });
    }

    // Generar un ID amigable de 6 caracteres alfanuméricos
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let friendlyId = "";
    for (let i = 0; i < 6; i++) {
      friendlyId += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Insertar en D1
    await DB.prepare(`
      INSERT INTO flyers (id, title, description, foto_key, phones, socials, tipo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      friendlyId,
      title,
      description,
      foto_key,
      JSON.stringify(phones || []),
      JSON.stringify(socials || []),
      tipo || "desaparecido"
    ).run();

    // Si el usuario seleccionó registrar, encolamos automáticamente el reporte de búsqueda
    if (registrarEnBusca) {
      const nombreLimpio = title.replace(/se busca:?/i, "").replace(/desaparecido:?/i, "").trim();
      const contactoReporte = phones && phones.length > 0 ? phones[0] : (socials && socials.length > 0 ? socials[0] : "Web Flyer");
      
      await cfEnv.CENSO_QUEUE.send({
        type: "reporte",
        data: {
          tipo: "desaparecido",
          nombre_buscado: nombreLimpio,
          descripcion: description,
          reportante_nombre: "Creador de Flyer",
          reportante_contacto: contactoReporte,
          foto_key: foto_key
        }
      });
    }

    // Notificar al canal público de Telegram (fire-and-forget, no bloquea la respuesta)
    const cfCtx = (context.locals as any).cfContext || (context.locals as any).runtime?.ctx;
    const notifyPromise = notifyChannel(cfEnv, friendlyId, title, description, phones || []);
    if (cfCtx?.waitUntil) {
      cfCtx.waitUntil(notifyPromise);
    } else {
      notifyPromise.catch(() => {});
    }

    return new Response(JSON.stringify({ success: true, id: friendlyId }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al crear flyer:", error);
    return new Response(JSON.stringify({ error: error.message || "Error interno del servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
