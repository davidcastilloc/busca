import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { generarEmbedding } from "../../lib/ai";
import { normalizarTexto, detectarTipoQuery, generarVariantesFuzzy } from "../../lib/search";

export const prerender = false;

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Hash simple para clave de cache */
function hashQuery(q: string, limit: number, offset: number): string {
  let h = 0;
  const s = `${q}:${limit}:${offset}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `buscar:${h}`;
}

// ─── Tipos internos ───────────────────────────────────────

interface ResultadoUnificado {
  [key: string]: any;
  _source: 'persona' | 'reporte';
  score: number;
  match_type: string;
}

interface RequestBody {
  q?: string;
  limit?: number;
  offset?: number;
  foto_base64?: string | null;
}

// ─── Búsquedas en D1 ─────────────────────────────────────

/** Búsqueda exacta por cédula en ambas tablas */
async function buscarPorCedula(DB: D1Database, cedula: string): Promise<ResultadoUnificado[]> {
  const [personas, reportes] = await Promise.all([
    DB.prepare("SELECT * FROM personas WHERE cedula = ?").bind(cedula).all(),
    DB.prepare("SELECT * FROM reportes WHERE cedula_buscado = ?").bind(cedula).all(),
  ]);

  const resultados: ResultadoUnificado[] = [];

  for (const p of personas.results || []) {
    resultados.push({ ...p, _source: 'persona', score: 1.0, match_type: 'cedula_exacta' });
  }
  for (const r of reportes.results || []) {
    resultados.push({ ...r, _source: 'reporte', score: 1.0, match_type: 'cedula_exacta' });
  }

  return resultados;
}

/** Construye cláusula WHERE con variantes fuzzy para LIKE */
function buildFuzzyWhere(
  variantes: string[],
  columnas: string[]
): { clause: string; params: string[] } {
  const condiciones: string[] = [];
  const params: string[] = [];

  for (const variante of variantes) {
    const like = `%${variante}%`;
    for (const col of columnas) {
      condiciones.push(`${col} LIKE ?`);
      params.push(like);
    }
  }

  return { clause: condiciones.join(' OR '), params };
}

/** Búsqueda fuzzy por nombre en personas y reportes */
async function buscarPorNombre(DB: D1Database, query: string): Promise<ResultadoUnificado[]> {
  const variantes = generarVariantesFuzzy(query);

  // Personas: buscar en nombre y apellido
  const pWhere = buildFuzzyWhere(variantes, ['nombre', 'apellido']);
  // Reportes: buscar en nombre_buscado
  const rWhere = buildFuzzyWhere(variantes, ['nombre_buscado']);

  const [personas, reportes] = await Promise.all([
    DB.prepare(`SELECT * FROM personas WHERE ${pWhere.clause} ORDER BY updated_at DESC LIMIT 50`)
      .bind(...pWhere.params).all(),
    DB.prepare(`SELECT * FROM reportes WHERE ${rWhere.clause} ORDER BY updated_at DESC LIMIT 50`)
      .bind(...rWhere.params).all(),
  ]);

  const resultados: ResultadoUnificado[] = [];

  for (const p of personas.results || []) {
    resultados.push({ ...p, _source: 'persona', score: 0.85, match_type: 'nombre' });
  }
  for (const r of reportes.results || []) {
    resultados.push({ ...r, _source: 'reporte', score: 0.85, match_type: 'nombre' });
  }

  return resultados;
}

/** Búsqueda por descripción (todos los tokens con AND) */
async function buscarPorDescripcion(DB: D1Database, query: string): Promise<ResultadoUnificado[]> {
  const tokens = query.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return [];

  // Personas: cada token debe coincidir en al menos un campo
  const pParams: string[] = [];
  const pCondiciones = tokens.map(token => {
    const t = `%${token}%`;
    pParams.push(t, t, t, t);
    return "(nombre LIKE ? OR apellido LIKE ? OR ubicacion_nombre LIKE ? OR refugio LIKE ?)";
  });

  // Reportes: cada token en nombre_buscado, descripcion o ubicacion_nombre
  const rParams: string[] = [];
  const rCondiciones = tokens.map(token => {
    const t = `%${token}%`;
    rParams.push(t, t, t);
    return "(nombre_buscado LIKE ? OR descripcion LIKE ? OR ubicacion_nombre LIKE ?)";
  });

  const [personas, reportes] = await Promise.all([
    DB.prepare(`SELECT * FROM personas WHERE ${pCondiciones.join(" AND ")} ORDER BY updated_at DESC LIMIT 50`)
      .bind(...pParams).all(),
    DB.prepare(`SELECT * FROM reportes WHERE ${rCondiciones.join(" AND ")} ORDER BY updated_at DESC LIMIT 50`)
      .bind(...rParams).all(),
  ]);

  const resultados: ResultadoUnificado[] = [];

  for (const p of personas.results || []) {
    // Si coincidió en ubicacion → score menor
    const pNorm = normalizarTexto(`${(p as any).nombre || ''} ${(p as any).apellido || ''}`);
    const qNorm = normalizarTexto(query);
    const esUbicacion = !pNorm.includes(qNorm) && normalizarTexto((p as any).ubicacion_nombre || '').includes(qNorm);
    resultados.push({
      ...p,
      _source: 'persona',
      score: esUbicacion ? 0.6 : 0.85,
      match_type: esUbicacion ? 'ubicacion' : 'nombre',
    });
  }
  for (const r of reportes.results || []) {
    const rNorm = normalizarTexto((r as any).nombre_buscado || '');
    const qNorm = normalizarTexto(query);
    const esUbicacion = !rNorm.includes(qNorm) && normalizarTexto((r as any).ubicacion_nombre || '').includes(qNorm);
    resultados.push({
      ...r,
      _source: 'reporte',
      score: esUbicacion ? 0.6 : 0.85,
      match_type: esUbicacion ? 'ubicacion' : 'nombre',
    });
  }

  return resultados;
}

// ─── Búsqueda semántica con Vectorize ─────────────────────

async function buscarSemantico(
  query: string
): Promise<ResultadoUnificado[]> {
  const { AI, VECTOR_INDEX, DB } = env;

  const queryVector = await generarEmbedding({ AI } as Env, query);
  const vectorResults = await VECTOR_INDEX.query(queryVector, {
    topK: 15,
    returnMetadata: 'all',
  });

  if (!vectorResults.matches?.length) return [];

  // Extraer IDs de reportes y sus scores
  const scoresMap = new Map<number, number>();
  const ids: number[] = [];

  for (const match of vectorResults.matches) {
    const meta = match.metadata as { reporte_id?: number };
    const id = meta?.reporte_id || parseInt(match.id.replace('reporte-', ''), 10);
    if (id && !isNaN(id)) {
      scoresMap.set(id, match.score);
      ids.push(id);
    }
  }

  if (ids.length === 0) return [];

  // Cargar registros completos de D1
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await DB.prepare(
    `SELECT * FROM reportes WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  return (results || []).map((r: any) => ({
    ...r,
    _source: 'reporte' as const,
    score: scoresMap.get(r.id) || 0,
    match_type: 'semantico',
  }));
}

// ─── Describir foto con IA Vision ─────────────────────────

async function describirFoto(fotoBase64: string): Promise<string> {
  const { AI } = env;

  // Decodificar base64 a bytes
  const binaryStr = atob(fotoBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const prompt = `Describe detalladamente la apariencia física de la persona en esta imagen para una búsqueda de personas desaparecidas. Incluye: edad aproximada, sexo, color de piel, tipo de cabello, ropa que viste, rasgos faciales distintivos, accesorios, y cualquier seña particular (tatuajes, cicatrices, lunares). Responde en español, solo la descripción, sin introducciones.`;

  const response = await AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
    prompt,
    image: [...bytes],
    max_tokens: 512,
  });

  return typeof response?.response === 'string'
    ? response.response
    : String(response?.response || '');
}

// ─── Deduplicar y ordenar resultados ──────────────────────

function deduplicarResultados(resultados: ResultadoUnificado[]): ResultadoUnificado[] {
  const mapa = new Map<string, ResultadoUnificado>();

  for (const r of resultados) {
    const key = `${r._source}-${r.id}`;
    const existente = mapa.get(key);
    // Quedarse con el de mayor score
    if (!existente || r.score > existente.score) {
      mapa.set(key, r);
    }
  }

  return [...mapa.values()].sort((a, b) => b.score - a.score);
}

// ─── Endpoint principal ───────────────────────────────────

export const POST: APIRoute = async (context) => {
  try {
    const { CACHE_KV } = env;
    const body: RequestBody = await context.request.json();

    const q = body.q?.trim() || '';
    const fotoBase64 = body.foto_base64 || null;
    const limit = Math.min(Math.max(body.limit || 20, 1), 100);
    const offset = Math.max(body.offset || 0, 0);

    if (!q && !fotoBase64) {
      return new Response(
        JSON.stringify({ error: "Se requiere 'q' o 'foto_base64'" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Determinar query de búsqueda
    let searchQuery = q;
    let queryType: string;
    const esBusquedaFoto = !!fotoBase64;

    if (esBusquedaFoto) {
      // Describir la persona en la foto con IA Vision
      searchQuery = await describirFoto(fotoBase64!);
      queryType = 'foto';
    } else {
      queryType = detectarTipoQuery(q);
    }

    // Revisar cache (solo búsquedas de texto)
    const cacheKey = hashQuery(searchQuery, limit, offset);
    if (!esBusquedaFoto) {
      const cached = await CACHE_KV.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: { ...CORS_HEADERS, "X-Cache": "HIT" },
        });
      }
    }

    // ─── Ejecutar búsquedas en paralelo ───────────────────
    const { DB } = env;
    const promesas: Promise<ResultadoUnificado[]>[] = [];

    if (queryType === 'cedula') {
      promesas.push(buscarPorCedula(DB, searchQuery));
    } else if (queryType === 'nombre') {
      promesas.push(buscarPorNombre(DB, searchQuery));
      // Semántica si query >= 5 chars
      if (searchQuery.length >= 5) {
        promesas.push(
          buscarSemantico(searchQuery).catch(err => {
            console.error("Error en búsqueda semántica (nombre):", err);
            return []; // Fallar silenciosamente
          })
        );
      }
    } else {
      // 'descripcion' o 'foto' → D1 LIKE + semántica
      promesas.push(buscarPorDescripcion(DB, searchQuery));
      promesas.push(
        buscarSemantico(searchQuery).catch(err => {
          console.error("Error en búsqueda semántica:", err);
          return [];
        })
      );
    }

    const resultadosArrays = await Promise.all(promesas);
    const todosMerged = resultadosArrays.flat();

    // Deduplicar y ordenar
    const deduplicados = deduplicarResultados(todosMerged);
    const total = deduplicados.length;
    const paginados = deduplicados.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    const respuesta = JSON.stringify({
      results: paginados,
      total,
      hasMore,
      query_type: queryType,
    });

    // Cachear en KV 30s (solo texto, no fotos)
    if (!esBusquedaFoto) {
      await CACHE_KV.put(cacheKey, respuesta, { expirationTtl: 60 }).catch(() => {});
      // Nota: KV mínimo TTL es 60s, usamos ese como piso
    }

    return new Response(respuesta, {
      headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("Error en búsqueda unificada:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno en búsqueda" }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
