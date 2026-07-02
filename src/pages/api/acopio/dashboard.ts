import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { CATEGORIAS_INVENTARIO } from "../../../lib/items";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const { DB } = env;
    const url = new URL(request.url);
    const rawRefugioId = url.searchParams.get("refugio_id");

    if (!rawRefugioId) {
      return new Response(JSON.stringify({ error: "refugio_id es requerido" }), { status: 400 });
    }

    let tipo = "refugio";
    let id = rawRefugioId;
    if (rawRefugioId.includes(":")) {
      const parts = rawRefugioId.split(":");
      tipo = parts[0];
      id = parts[1];
    }

    // 1. Obtener Entradas: Ayudas en camino hacia este refugio
    // Si la ayuda es para una necesidad específica de este refugio, la unimos para dar contexto
    const columnMap: Record<string, string> = {
      refugio: "refugio_id",
      centro_acopio: "centro_acopio_id",
      hospital: "hospital_id"
    };
    const targetColumn = columnMap[tipo] || "refugio_id";

    const entradasRes = await DB.prepare(`
      SELECT a.id, a.voluntarios_count, a.estatus, a.created_at, n.categoria as necesidad_categoria, n.descripcion as necesidad_desc
      FROM ayudas_en_camino a
      LEFT JOIN necesidades n ON a.necesidad_id = n.id
      WHERE a.${targetColumn} = ? AND a.estatus = 'en_ruta'
    `).bind(id).all();

    // 2. Obtener Salidas: Necesidades críticas de otros refugios/acopios/hospitales
    // Solo las activas.
    const salidasRes = await DB.prepare(`
      SELECT n.id, n.categoria, n.gravedad, n.descripcion, n.estado, 
             COALESCE(r.nombre, c.nombre, h.nombre) as refugio_nombre,
             COALESCE(n.refugio_id, n.centro_acopio_id, n.hospital_id) as refugio_destino_id
      FROM necesidades n
      LEFT JOIN refugios r ON n.refugio_id = r.id
      LEFT JOIN centros_acopio c ON n.centro_acopio_id = c.id
      LEFT JOIN hospitales h ON n.hospital_id = h.id
      WHERE n.estado = 'activa' 
        AND (
          (? = 'refugio' AND (n.refugio_id IS NULL OR n.refugio_id != ?)) OR
          (? = 'centro_acopio' AND (n.centro_acopio_id IS NULL OR n.centro_acopio_id != ?)) OR
          (? = 'hospital' AND (n.hospital_id IS NULL OR n.hospital_id != ?))
        )
      ORDER BY 
        CASE n.gravedad 
          WHEN 'sos' THEN 1 
          WHEN 'alta' THEN 2 
          WHEN 'media' THEN 3 
          ELSE 4 
        END ASC, n.created_at DESC
      LIMIT 50
    `).bind(tipo, id, tipo, id, tipo, id).all();

    // 3. Inventario actual del refugio/acopio (para tener a la mano qué se puede despachar)
    const tableName = tipo === "centro_acopio" ? "centros_acopio" : "refugios";
    const refugioRes = await DB.prepare(`
      SELECT nombre, inventario FROM ${tableName} WHERE id = ?
    `).bind(id).first<any>();

    let inventarioLimpio: any[] = [];
    if (refugioRes && refugioRes.inventario) {
      try {
        const inv = typeof refugioRes.inventario === "string" ? JSON.parse(refugioRes.inventario) : refugioRes.inventario;
        for (const [itemId, estado] of Object.entries(inv)) {
          const itemObj = CATEGORIAS_INVENTARIO.flatMap((c) => c.items).find((i) => i.id === itemId);
          if (itemObj) {
            inventarioLimpio.push({
              nombre: itemObj.nombre,
              estado: estado // Ej: 'Sobrante', 'Suficiente', 'Crítico'
            });
          }
        }
      } catch (e) {}
    }

    return new Response(
      JSON.stringify({
        success: true,
        refugio_nombre: refugioRes ? refugioRes.nombre : "Desconocido",
        entradas: entradasRes.results || [],
        salidas: salidasRes.results || [],
        inventario: inventarioLimpio
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("Error API Acopio:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
