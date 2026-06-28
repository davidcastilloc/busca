import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'Falta ID del voluntario' }), { status: 400 });
  }

  try {
    const { DB } = env;
    const body = (await request.json()) as Record<string, any>;
    
    // accion: 'ban' o 'unban'
    const accion = body.accion || 'ban';
    const nuevoEstado = accion === 'ban' ? 0 : 1;

    // 1. Actualizar estado del voluntario
    const updateQuery = `UPDATE voluntarios SET activo = ? WHERE id = ?`;
    await DB.prepare(updateQuery).bind(nuevoEstado, id).run();

    if (accion === 'ban') {
      // 2. Eliminar sesiones para forzar deslogueo
      const deleteSesionesWeb = `DELETE FROM sesiones_voluntarios WHERE voluntario_id = ?`;
      await DB.prepare(deleteSesionesWeb).bind(id).run();

      // Para Telegram dependemos del telegram_id si existe
      // Buscar el telegram_id del voluntario
      const volInfo = await DB.prepare(`SELECT telegram_id FROM voluntarios WHERE id = ?`).bind(id).first();
      
      if (volInfo && volInfo.telegram_id) {
        const deleteSesionesTg = `DELETE FROM telegram_sessions WHERE telegram_id = ?`;
        await DB.prepare(deleteSesionesTg).bind(volInfo.telegram_id).run();
      }
    }

    // 3. Registrar en el historial de actividad (auditoría)
    const logQuery = `INSERT INTO historial_actividad (tipo_entidad, entidad_id, accion, actor, detalles) VALUES (?, ?, ?, ?, ?)`;
    await DB.prepare(logQuery)
      .bind(
        'voluntario', 
        id, 
        accion === 'ban' ? 'banned' : 'unbanned', 
        'SUPER_ADMIN_DIOS', 
        JSON.stringify({ motivo: body.motivo || 'Baneado desde el panel de Super Admin' })
      )
      .run();

    return new Response(JSON.stringify({ success: true, estado: nuevoEstado }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
