import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

function enmascararContacto(contacto: string | null | undefined): string | null {
  if (!contacto) return null;
  const c = contacto.trim();
  if (c.length <= 6) return "***";
  return c.substring(0, 4) + " *** " + c.substring(c.length - 4);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { DB } = env;
    const body = await request.json();
    const personas = body.personas as { nombre: string; cedula: number | string | null }[];

    if (!personas || !Array.isArray(personas) || personas.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "La lista de personas está vacía." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Limitamos a un máximo de 40 personas por request para mantener el D1 batch por debajo de 100 statements
    const listaLimitada = personas.slice(0, 40);
    const statements: any[] = [];

    // Por cada persona preparamos:
    // 1. Búsqueda en censo de personas localizado (tabla personas)
    // 2. Búsqueda en reportes (tabla reportes)
    listaLimitada.forEach(p => {
      const nombreCompleto = p.nombre.trim();
      const partes = nombreCompleto.split(/\s+/);
      const primerNombre = partes[0] || "";
      const primerApellido = partes[partes.length - 1] || "";
      
      const cedulaStr = p.cedula ? String(p.cedula) : null;
      const queryNombreCompleto = `%${nombreCompleto}%`;
      const queryPrimerNombre = `%${primerNombre}%`;
      const queryPrimerApellido = `%${primerApellido}%`;

      // SQL 1: Personas
      statements.push(
        DB.prepare(`
          SELECT id, nombre, apellido, estado, refugio, contacto, cedula, edad, updated_at
          FROM personas
          WHERE (? IS NOT NULL AND cedula = ?)
             OR (nombre || ' ' || COALESCE(apellido, '')) LIKE ?
             OR (nombre LIKE ? AND COALESCE(apellido, '') LIKE ?)
          LIMIT 3
        `).bind(cedulaStr, cedulaStr, queryNombreCompleto, queryPrimerNombre, queryPrimerApellido)
      );

      // SQL 2: Reportes
      statements.push(
        DB.prepare(`
          SELECT id, tipo, nombre_buscado, cedula_buscado, descripcion, estado_reporte, reportante_contacto, updated_at
          FROM reportes
          WHERE (? IS NOT NULL AND cedula_buscado = ?)
             OR nombre_buscado LIKE ?
             OR (nombre_buscado LIKE ? AND nombre_buscado LIKE ?)
          LIMIT 3
        `).bind(cedulaStr, cedulaStr, queryNombreCompleto, queryPrimerNombre, queryPrimerApellido)
      );
    });

    // Ejecutar todas las consultas en un solo roundtrip
    const batchResults = await DB.batch<any>(statements);

    // Formatear la respuesta agrupando los resultados por la persona originalmente buscada
    const results = listaLimitada.map((p, index) => {
      const personasMatch = batchResults[index * 2]?.results || [];
      const reportesMatch = batchResults[index * 2 + 1]?.results || [];

      // Mapear y enmascarar contactos
      const personasFormateadas = personasMatch.map((pm: any) => ({
        id: pm.id,
        nombre: `${pm.nombre} ${pm.apellido || ""}`.trim(),
        cedula: pm.cedula,
        estado: pm.estado, // localizado, herido, fallecido, desconocido
        refugio: pm.refugio,
        contacto_enmascarado: enmascararContacto(pm.contacto),
        updated_at: pm.updated_at,
        _source: "persona"
      }));

      const reportesFormateados = reportesMatch.map((rm: any) => ({
        id: rm.id,
        tipo: rm.tipo, // desaparecido, encontrado, refugio, necesidad
        nombre: rm.nombre_buscado,
        cedula: rm.cedula_buscado,
        estado_reporte: rm.estado_reporte, // abierto, resuelto, archivado
        descripcion: rm.descripcion,
        contacto_enmascarado: enmascararContacto(rm.reportante_contacto),
        updated_at: rm.updated_at,
        _source: "reporte"
      }));

      // Determinar estado de coincidencia general
      let estadoCoincidencia = "sin_registro"; // localizado_al_salvo, reporte_activo, sin_registro
      
      const tieneVivo = personasFormateadas.some((f: any) => f.estado === "localizado" || f.estado === "herido");
      const tieneReporteAbierto = reportesFormateados.some((r: any) => r.estado_reporte === "abierto" && r.tipo === "desaparecido");

      if (tieneVivo) {
        estadoCoincidencia = "localizado_al_salvo";
      } else if (tieneReporteAbierto) {
        estadoCoincidencia = "reporte_activo";
      }

      return {
        buscado: p,
        estado: estadoCoincidencia,
        coincidencias: {
          personas: personasFormateadas,
          reportes: reportesFormateados
        }
      };
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en búsqueda masiva:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
