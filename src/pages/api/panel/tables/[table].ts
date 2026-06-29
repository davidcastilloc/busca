import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

// Lista blanca para evitar SQL Injections
const ALLOWED_TABLES = [
  'personas',
  'reportes',
  'flyers',
  'push_subscriptions',
  'refugios',
  'telegram_sessions',
  'voluntarios',
  'sesiones_voluntarios',
  'historial_actividad'
];

export const GET: APIRoute = async ({ params, request }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    const { DB } = env;

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Consulta segura porque 'table' fue validada contra ALLOWED_TABLES
    let queryStr = `SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ? OFFSET ?`;
    let bindings: any[] = [limit, offset];

    if (table === 'refugios') {
      queryStr = `
        SELECT t.*, v.nombre as creador_nombre 
        FROM refugios t 
        LEFT JOIN voluntarios v ON t.created_by = v.id 
        ORDER BY t.rowid DESC 
        LIMIT ? OFFSET ?
      `;
    } else if (table === 'reportes') {
      queryStr = `
        SELECT t.*, v.nombre as creador_nombre 
        FROM reportes t 
        LEFT JOIN voluntarios v ON t.created_by = v.id 
        ORDER BY t.rowid DESC 
        LIMIT ? OFFSET ?
      `;
    } else if (table === 'personas') {
      queryStr = `
        SELECT t.*, v.nombre as creador_nombre 
        FROM personas t 
        LEFT JOIN voluntarios v ON t.created_by = v.id 
        ORDER BY t.rowid DESC 
        LIMIT ? OFFSET ?
      `;
    } else if (table === 'historial_actividad') {
      // JOIN para obtener el nombre del voluntario en vez de solo voluntario_id
      queryStr = `
        SELECT h.*, v.nombre as voluntario_nombre 
        FROM historial_actividad h 
        LEFT JOIN voluntarios v ON h.voluntario_id = v.id 
        ORDER BY h.rowid DESC 
        LIMIT ? OFFSET ?
      `;
    }

    const result = await DB.prepare(queryStr).bind(...bindings).all();
    
    // Obtener información de columnas
    const pragmaQuery = `PRAGMA table_info(${table})`;
    const columnsResult = await DB.prepare(pragmaQuery).all();
    let columns = columnsResult.results;

    if (table === 'historial_actividad') {
      // Inyectar columna extra virtual para que la UI la renderice
      columns = [
        ...columns,
        { name: 'voluntario_nombre', type: 'TEXT' }
      ];
    } else if (['refugios', 'reportes', 'personas'].includes(table)) {
      columns = [
        ...columns,
        { name: 'creador_nombre', type: 'TEXT' }
      ];
    }

    return new Response(JSON.stringify({ data: result.results, columns: columns }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    const { DB } = env;
    const body = (await request.json()) as Record<string, any>;

    const keys = Object.keys(body);
    const values = Object.values(body);

    if (keys.length === 0) {
      return new Response(JSON.stringify({ error: 'Cuerpo de petición vacío' }), { status: 400 });
    }

    const placeholders = keys.map(() => '?').join(', ');
    const columnsStr = keys.join(', ');

    const queryStr = `INSERT INTO ${table} (${columnsStr}) VALUES (${placeholders})`;
    
    await DB.prepare(queryStr).bind(...values).run();

    return new Response(JSON.stringify({ success: true }), { status: 201 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    const { DB } = env;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const body = (await request.json()) as Record<string, any>;

    if (!id) {
       return new Response(JSON.stringify({ error: 'Falta parámetro id' }), { status: 400 });
    }

    const keys = Object.keys(body);
    const values = Object.values(body);

    if (keys.length === 0) {
      return new Response(JSON.stringify({ error: 'Cuerpo de petición vacío' }), { status: 400 });
    }

    const setStr = keys.map(k => `${k} = ?`).join(', ');
    const queryStr = `UPDATE ${table} SET ${setStr} WHERE id = ?`;
    
    await DB.prepare(queryStr).bind(...values, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    const { DB } = env;
    const url = new URL(request.url);
    
    // Podemos requerir rowid si la tabla no tiene id primario explícito, o usar id.
    const id = url.searchParams.get('id');
    const idCol = url.searchParams.get('id_col') || 'id'; // Para sesiones puede ser token

    if (!id) {
       return new Response(JSON.stringify({ error: 'Falta parámetro id' }), { status: 400 });
    }

    const queryStr = `DELETE FROM ${table} WHERE ${idCol} = ?`;
    await DB.prepare(queryStr).bind(id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
