import type { D1Database } from "@cloudflare/workers-types";

export interface PersonaData {
  cedula?: string | null;
  nombre: string;
  apellido?: string | null;
  edad?: number | null;
  sexo?: "M" | "F" | "X";
  estado?: "localizado" | "herido" | "fallecido" | "desconocido";
  ubicacion_nombre?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  refugio?: string | null;
  contacto?: string | null;
  notas?: string | null;
  foto_key?: string | null;
  fuente?: string;
  refugio_id?: number | null;
  hospital_id?: number | null;
  centro_acopio_id?: number | null;
  created_by?: number | null;
}

export interface ReporteData {
  tipo: "desaparecido" | "encontrado" | "refugio" | "necesidad";
  nombre_buscado?: string | null;
  cedula_buscado?: string | null;
  descripcion: string;
  reportante_nombre?: string | null;
  reportante_contacto?: string | null;
  ubicacion_nombre?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  foto_key?: string | null;
  refugio_id?: number | null;
  hospital_id?: number | null;
  centro_acopio_id?: number | null;
  created_by?: number | null;
}

/**
 * Inserta o actualiza una persona individual (con conflicto en cédula)
 */
export async function upsertPersona(db: D1Database, data: PersonaData) {
  if (data.cedula) {
    return await db.prepare(`
      INSERT INTO personas (
        cedula, nombre, apellido, edad, sexo, estado, 
        ubicacion_nombre, latitud, longitud, refugio, 
        contacto, notas, foto_key, fuente, refugio_id, hospital_id, centro_acopio_id, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'))
      ON CONFLICT(cedula) DO UPDATE SET
        nombre = excluded.nombre,
        apellido = excluded.apellido,
        edad = excluded.edad,
        sexo = excluded.sexo,
        estado = excluded.estado,
        ubicacion_nombre = excluded.ubicacion_nombre,
        latitud = excluded.latitud,
        longitud = excluded.longitud,
        refugio = excluded.refugio,
        contacto = excluded.contacto,
        notas = excluded.notas,
        foto_key = excluded.foto_key,
        fuente = excluded.fuente,
        refugio_id = excluded.refugio_id,
        hospital_id = excluded.hospital_id,
        centro_acopio_id = excluded.centro_acopio_id,
        created_by = COALESCE(personas.created_by, excluded.created_by),
        updated_at = datetime('now', '-4 hours')
    `).bind(
      data.cedula,
      data.nombre,
      data.apellido || null,
      data.edad || null,
      data.sexo || "X",
      data.estado || "desconocido",
      data.ubicacion_nombre || null,
      data.latitud || null,
      data.longitud || null,
      data.refugio || null,
      data.contacto || null,
      data.notas || null,
      data.foto_key || null,
      data.fuente || "web",
      data.refugio_id || null,
      data.hospital_id || null,
      data.centro_acopio_id || null,
      data.created_by || null
    ).run();
  } else {
    return await db.prepare(`
      INSERT INTO personas (
        nombre, apellido, edad, sexo, estado, 
        ubicacion_nombre, latitud, longitud, refugio, 
        contacto, notas, foto_key, fuente, refugio_id, hospital_id, centro_acopio_id, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'))
    `).bind(
      data.nombre,
      data.apellido || null,
      data.edad || null,
      data.sexo || "X",
      data.estado || "desconocido",
      data.ubicacion_nombre || null,
      data.latitud || null,
      data.longitud || null,
      data.refugio || null,
      data.contacto || null,
      data.notas || null,
      data.foto_key || null,
      data.fuente || "web",
      data.refugio_id || null,
      data.hospital_id || null,
      data.centro_acopio_id || null,
      data.created_by || null
    ).run();
  }
}

/**
 * Inserta un reporte y retorna su ID
 */
export async function insertReporte(db: D1Database, data: ReporteData): Promise<number | null> {
  const result = await db.prepare(`
    INSERT INTO reportes (
      tipo, nombre_buscado, cedula_buscado, descripcion, 
      reportante_nombre, reportante_contacto, ubicacion_nombre, 
      latitud, longitud, foto_key, refugio_id, hospital_id, centro_acopio_id, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'))
    RETURNING id
  `).bind(
    data.tipo,
    data.nombre_buscado || null,
    data.cedula_buscado || null,
    data.descripcion,
    data.reportante_nombre || null,
    data.reportante_contacto || null,
    data.ubicacion_nombre || null,
    data.latitud || null,
    data.longitud || null,
    data.foto_key || null,
    data.refugio_id || null,
    data.hospital_id || null,
    data.centro_acopio_id || null,
    data.created_by || null
  ).first<{ id: number }>();

  if (result?.id && data.created_by) {
    await db.prepare(`
      INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
      VALUES (?, 'CREAR', 'reportes', ?, datetime('now', '-4 hours'))
    `).bind(data.created_by, result.id).run();
  }

  return result?.id || null;
}

/**
 * Resuelve reportes de desaparición que coincidan con cédula o nombre
 */
export async function resolverReportesRelacionados(db: D1Database, cedula?: string | null, nombre?: string | null) {
  const batchStatements = [];

  if (cedula) {
    batchStatements.push(
      db.prepare(`
        UPDATE reportes 
        SET estado_reporte = 'resuelto', 
            updated_at = datetime('now', '-4 hours') 
        WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
      `).bind(cedula)
    );
  }

  if (nombre && nombre.length > 3) {
    batchStatements.push(
      db.prepare(`
        UPDATE reportes 
        SET estado_reporte = 'resuelto', 
            updated_at = datetime('now', '-4 hours') 
        WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
      `).bind(`%${nombre}%`)
    );
  }

  if (batchStatements.length > 0) {
    await db.batch(batchStatements);
  }
}

interface CensoPersona {
  nombre: string;
  cedula: number | null;
  telefono: string | null;
  edad: number | null;
}

/**
 * Procesa masivamente un censo usando batching D1 (optimizado a 3 roundtrips)
 */
export async function procesarCensoBatch(
  db: D1Database,
  personas: CensoPersona[],
  refugio: string | null,
  contacto: string | null,
  refugioId: number | null,
  hospitalId: number | null = null,
  centroAcopioId: number | null = null,
  voluntarioId: number | null = null
): Promise<{ matchesCount: number; results: { nombre: string; matches: any[]; personaId: number }[] }> {
  if (personas.length === 0) return { matchesCount: 0, results: [] };

  // --- ROUNDTRIP 1: Buscar coincidencias para todas las personas ---
  const selectStatements = personas.map(p => {
    const nombreCompleto = p.nombre.trim();
    const partes = nombreCompleto.split(/\s+/);
    const primerNombre = partes[0] || "";
    const primerApellido = partes[partes.length - 1] || "";
    const queryTerm = `%${nombreCompleto}%`;

    return db.prepare(`
      SELECT id, nombre_buscado, reportante_contacto FROM reportes 
      WHERE tipo = 'desaparecido' 
        AND estado_reporte = 'abierto'
        AND (nombre_buscado LIKE ? 
             OR (nombre_buscado LIKE ? AND nombre_buscado LIKE ?))
    `).bind(queryTerm, `%${primerNombre}%`, `%${primerApellido}%`);
  });

  const selectResults = await db.batch<any>(selectStatements);

  // --- ROUNDTRIP 2: Insertar todas las personas en la tabla personas ---
  const insertStatements = personas.map(p => {
    const nombreCompleto = p.nombre.trim();
    const partes = nombreCompleto.split(/\s+/);
    const nombre = partes[0] || "";
    const apellido = partes.slice(1).join(" ") || null;
    const finalContacto = [p.telefono, contacto].filter(Boolean).join(" - ") || null;

    return db.prepare(`
      INSERT INTO personas (nombre, apellido, estado, refugio, contacto, cedula, edad, fuente, refugio_id, hospital_id, centro_acopio_id, created_by, updated_at, created_at)
      VALUES (?, ?, 'localizado', ?, ?, ?, ?, 'escaner_ia', ?, ?, ?, ?, datetime('now', '-4 hours'), datetime('now', '-4 hours'))
      RETURNING id
    `).bind(
      nombre,
      apellido,
      refugio,
      finalContacto,
      p.cedula ? String(p.cedula) : null,
      p.edad,
      refugioId,
      hospitalId,
      centroAcopioId,
      voluntarioId
    );
  });

  const insertResults = await db.batch<{ id: number }>(insertStatements);

  // Mapear resultados obtenidos
  const processingResults = personas.map((p, index) => {
    const matches = selectResults[index]?.results || [];
    const personaId = insertResults[index]?.results?.[0]?.id || 0;
    return {
      nombre: p.nombre,
      matches,
      personaId
    };
  });

  // --- ROUNDTRIP 3: Actualizar reportes que coincidieron ---
  const updateStatements: D1PreparedStatement[] = [];
  let matchesCount = 0;

  for (const res of processingResults) {
    if (res.matches.length > 0) {
      matchesCount += res.matches.length;
      for (const match of res.matches) {
        updateStatements.push(
          db.prepare(`
            UPDATE reportes 
            SET estado_reporte = 'resuelto', 
                verificacion = 'pendiente',
                persona_id = ?,
                updated_at = datetime('now', '-4 hours') 
            WHERE id = ?
          `).bind(res.personaId, match.id)
        );
      }
    }
  }

  if (updateStatements.length > 0) {
    await db.batch(updateStatements);
  }

  return { matchesCount, results: processingResults };
}
