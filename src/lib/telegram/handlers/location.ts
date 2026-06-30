import type { TelegramClient } from "../client";

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

export async function handleLocation(
  client: TelegramClient,
  db: D1Database,
  chatId: string | number,
  userLat: number,
  userLon: number
): Promise<void> {
  try {
        const query = `
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'refugio' as tipo, inventario FROM refugios
      UNION ALL
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'centro_acopio' as tipo, inventario FROM centros_acopio
      UNION ALL
      SELECT id, nombre, direccion, latitud, longitud, contacto, necesidades, 'hospital' as tipo, NULL as inventario FROM hospitales
    `;
    const res = await db.prepare(query).all<any>();
    const refugios = res.results || [];

    if (refugios.length === 0) {
      await client.sendMessage(
        chatId,
        "🏢 No se encontraron albergues o centros registrados en el sistema."
      );
      return;
    }

    // Calcular distancias y ordenar
    const sorted = refugios
      .map((r) => {
        const dist = getDistance(userLat, userLon, r.latitud, r.longitud);
        return { ...r, distancia: dist };
      })
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 3); // Obtener los 3 más cercanos

    let responseText = `📍 <b>Centros más cercanos a tu ubicación:</b>\n\n`;

    sorted.forEach((r, idx) => {
      const tipoEmoji = {
        refugio: "🏠 Albergue",
        hospital: "🏥 Hospital",
        centro_acopio: "📦 Centro de Acopio",
      }[r.tipo as string] || "🏢 Centro";

      // Formatear semáforo del inventario si existe
      let semaforo = "🟢 Estable";
      if (r.inventario) {
        try {
          const inv = typeof r.inventario === "string" ? JSON.parse(r.inventario) : r.inventario;
          const values = Object.values(inv);
          if (values.includes("Crítico")) {
            // @ts-ignore
            semaforo = "🔴 Crítico (Insumos urgentes)";
          } else if (values.includes("Bajo")) {
            // @ts-ignore
            semaforo = "🟡 Bajo (Faltan insumos)";
          }
        } catch (e) {
          // ignore
        }
      }

      responseText += `${idx + 1}. <b>${r.nombre}</b> (${tipoEmoji})\n`;
      responseText += `   📏 Distancia: <b>${r.distancia.toFixed(2)} km</b>\n`;
      if (r.direccion) responseText += `   📍 Dirección: ${r.direccion}\n`;
      responseText += `   📦 Inventario: ${semaforo}\n`;
      if (r.contacto) responseText += `   📞 Contacto: ${r.contacto}\n`;
      responseText += `   🚗 <a href="https://www.google.com/maps/dir/?api=1&destination=${r.latitud},${r.longitud}">Cómo llegar (Google Maps)</a>\n\n`;
    });

    await client.sendMessage(chatId, responseText, {
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error("handleLocation error:", error);
    await client.sendMessage(
      chatId,
      "❌ Error al consultar la base de datos de albergues."
    );
  }
}
