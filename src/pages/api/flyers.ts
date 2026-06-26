import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime.env;
    const { DB, FOTOS_BUCKET } = env;

    const body = await context.request.json();
    const { title, description, photo, phones, socials, registrarEnBusca } = body;

    if (!title || !description || !photo) {
      return new Response(JSON.stringify({ error: "Título, descripción y foto son obligatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

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
    const foto_key = `flyers/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    // Subir a R2
    await FOTOS_BUCKET.put(foto_key, bytes.buffer, {
      httpMetadata: { contentType: mime }
    });

    // Generar un ID amigable de 6 caracteres alfanuméricos
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let friendlyId = "";
    for (let i = 0; i < 6; i++) {
      friendlyId += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Insertar en D1
    await DB.prepare(`
      INSERT INTO flyers (id, title, description, foto_key, phones, socials)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      friendlyId,
      title,
      description,
      foto_key,
      JSON.stringify(phones || []),
      JSON.stringify(socials || [])
    ).run();

    // Si el usuario seleccionó registrar, encolamos automáticamente el reporte de búsqueda
    if (registrarEnBusca) {
      const nombreLimpio = title.replace(/se busca:?/i, "").replace(/desaparecido:?/i, "").trim();
      const contactoReporte = phones && phones.length > 0 ? phones[0] : (socials && socials.length > 0 ? socials[0] : "Web Flyer");
      
      await env.CENSO_QUEUE.send({
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
