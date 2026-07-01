import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const PUT: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) throw new Error("Base de datos no disponible");

    const id = context.params.id;
    if (!id) throw new Error("ID de necesidad requerido");

    const body = await context.request.json();
    
    // Solo permitimos actualizar el estado por ahora
    if (body.estado !== "atendida" && body.estado !== "cancelada" && body.estado !== "abierta") {
        throw new Error("Estado inválido");
    }

    const result = await DB.prepare(`
      UPDATE necesidades
      SET estado = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(body.estado, id).run();

    if (!result.success) {
        throw new Error("No se pudo actualizar la necesidad");
    }

    if (body.estado === "atendida" || body.estado === "cancelada") {
      await DB.prepare("DELETE FROM flyers WHERE necesidad_id = ?").bind(id).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al actualizar necesidad:", error);
    return new Response(JSON.stringify({ error: error.message || "Error interno" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};
