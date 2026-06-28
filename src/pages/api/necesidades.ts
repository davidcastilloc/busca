import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { NecesidadSchema } from "../../lib/validators";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    const body = await context.request.json();
    const validated = NecesidadSchema.parse(body);

    const result = await DB.prepare(`
      INSERT INTO necesidades (
        categoria, gravedad, afectados, descripcion, ubicacion_nombre, 
        latitud, longitud, telefono, foto_key, refugio_id, reportante_nombre, reportante_contacto
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      validated.categoria,
      validated.gravedad,
      validated.afectados ?? null,
      validated.descripcion,
      validated.ubicacion_nombre ?? null,
      validated.latitud ?? null,
      validated.longitud ?? null,
      validated.telefono ?? null,
      validated.foto_key ?? null,
      validated.refugio_id ?? null,
      validated.reportante_nombre ?? null,
      validated.reportante_contacto ?? null
    ).first<{ id: number }>();

    return new Response(JSON.stringify({ success: true, id: result?.id }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al registrar necesidad:", error);
    return new Response(JSON.stringify({ error: error.message || "Datos inválidos" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    const { searchParams } = new URL(context.request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await DB.prepare(`
      SELECT n.*, r.nombre as refugio_nombre 
      FROM necesidades n
      LEFT JOIN refugios r ON n.refugio_id = r.id
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return new Response(JSON.stringify(result.results), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
