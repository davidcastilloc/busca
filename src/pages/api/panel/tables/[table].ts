import type { APIRoute } from 'astro';

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

export const GET: APIRoute = async ({ params, request, locals }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    // @ts-ignore
    const { env } = locals.runtime;
    const { DB } = env;

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Consulta segura porque 'table' fue validada contra ALLOWED_TABLES
    const queryStr = `SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ? OFFSET ?`;
    const result = await DB.prepare(queryStr).bind(limit, offset).all();
    
    // Obtener información de columnas
    const pragmaQuery = `PRAGMA table_info(${table})`;
    const columns = await DB.prepare(pragmaQuery).all();

    return new Response(JSON.stringify({ data: result.results, columns: columns.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    // @ts-ignore
    const { env } = locals.runtime;
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

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    // @ts-ignore
    const { env } = locals.runtime;
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

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const table = params.table as string;
  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Tabla no permitida' }), { status: 403 });
  }

  try {
    // @ts-ignore
    const { env } = locals.runtime;
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
