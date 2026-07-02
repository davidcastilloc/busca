import type { TelegramClient } from "../client";

export async function handleSearch(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  query: string
): Promise<void> {
  const q = query.trim();
  if (!q) {
    await client.sendMessage(
      chatId,
      "⚠️ Por favor ingresa el nombre o número de cédula a buscar.\nUso: <code>/buscar Juan Perez</code> o <code>/buscar 12345678</code>"
    );
    return;
  }

  await client.sendMessage(chatId, `🔍 Buscando: "<b>${q}</b>"...`);

  try {
    const tokens = q.split(/\s+/).filter((t) => t.length > 0);
    const isNumeric = /^\d+$/.test(q);

    // 1. Buscar en personas
    let queryPersonas = "SELECT * FROM personas";
    const paramsPersonas: unknown[] = [];

    if (isNumeric) {
      queryPersonas += " WHERE cedula = ?";
      paramsPersonas.push(q);
    } else if (tokens.length > 0) {
      queryPersonas += " WHERE " + tokens
        .map((token) => {
          const t = `%${token}%`;
          paramsPersonas.push(t, t, t, t);
          return "(nombre LIKE ? OR apellido LIKE ? OR ubicacion_nombre LIKE ? OR refugio LIKE ?)";
        })
        .join(" AND ");
    }
    queryPersonas += " ORDER BY updated_at DESC LIMIT 5";

    // 2. Buscar en reportes (desaparecido/encontrado)
    let queryReportes = "SELECT * FROM reportes";
    const paramsReportes: unknown[] = [];

    if (isNumeric) {
      queryReportes += " WHERE cedula_buscado = ?";
      paramsReportes.push(q);
    } else if (tokens.length > 0) {
      queryReportes += " WHERE " + tokens
        .map((token) => {
          const t = `%${token}%`;
          paramsReportes.push(t, t);
          return "(nombre_buscado LIKE ? OR ubicacion_nombre LIKE ?)";
        })
        .join(" AND ");
    }
    queryReportes += " ORDER BY updated_at DESC LIMIT 5";

    // Ejecutar ambas consultas en un batch atómico y eficiente
    const [personasRes, reportesRes] = await db.batch([
      db.prepare(queryPersonas).bind(...paramsPersonas),
      db.prepare(queryReportes).bind(...paramsReportes)
    ]);

    interface Persona {
      nombre: string;
      apellido?: string;
      cedula?: string;
      estado: string;
      refugio?: string;
      ubicacion_nombre?: string;
      notas?: string;
    }

    interface Reporte {
      nombre_buscado?: string;
      tipo: string;
      cedula_buscado?: string;
      descripcion: string;
      ubicacion_nombre?: string;
      estado_reporte: string;
    }

    const personas = (personasRes.results || []) as unknown as Persona[];
    const reportes = (reportesRes.results || []) as unknown as Reporte[];

    if (personas.length === 0 && reportes.length === 0) {
      await client.sendMessage(
        chatId,
        `❌ No se encontraron resultados para "<b>${q}</b>".\n\nVerifica que esté bien escrito o intenta con el número de cédula.`
      );
      return;
    }

    let responseText = `✨ <b>Resultados de búsqueda:</b>\n\n`;

    if (personas.length > 0) {
      responseText += `👤 <b>Censo de Personas:</b>\n`;
      personas.forEach((p) => {
        const estadoEmoji = {
          localizado: "🟢 Localizado",
          herido: "🟡 Herido",
          fallecido: "🔴 Fallecido",
          desconocido: "⚪ Desconocido",
        }[p.estado as string] || "⚪ Desconocido";

        responseText += `• <b>${p.nombre} ${p.apellido || ""}</b>\n`;
        if (p.cedula) responseText += `  Cédula: <code>${p.cedula}</code>\n`;
        responseText += `  Estado: ${estadoEmoji}\n`;
        if (p.refugio) responseText += `  Albergue: ${p.refugio}\n`;
        if (p.ubicacion_nombre) responseText += `  Ubicación: ${p.ubicacion_nombre}\n`;
        if (p.notas) responseText += `  Notas: <i>${p.notas}</i>\n`;
        responseText += `\n`;
      });
    }

    if (reportes.length > 0) {
      responseText += `📢 <b>Reportes de Emergencia:</b>\n`;
      reportes.forEach((r) => {
        const tipoEmoji = {
          desaparecido: "🚨 Desaparecido",
          encontrado: "🤝 Encontrado",
          refugio: "🏠 Refugio",
          necesidad: "📦 Necesidad",
        }[r.tipo as string] || "📢 Reporte";

        responseText += `• <b>${r.nombre_buscado || "Sin identificar"}</b> (${tipoEmoji})\n`;
        if (r.cedula_buscado) responseText += `  Cédula: <code>${r.cedula_buscado}</code>\n`;
        responseText += `  Detalles: ${r.descripcion}\n`;
        if (r.ubicacion_nombre) responseText += `  Ubicación: ${r.ubicacion_nombre}\n`;
        responseText += `  Estado Reporte: <i>${r.estado_reporte}</i>\n`;
        responseText += `\n`;
      });
    }

    await client.sendMessage(chatId, responseText);
  } catch (error: any) {
    console.error("Telegram search error:", error);
    await client.sendMessage(
      chatId,
      "❌ Ocurrió un error al consultar la base de datos."
    );
  }
}
