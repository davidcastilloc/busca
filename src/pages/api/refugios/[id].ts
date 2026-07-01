import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerVoluntarioSesion } from "../../../lib/auth-helpers";

export const prerender = false;

// GET /api/refugios/[id] - Detalle de un refugio
export const GET: APIRoute = async (context) => {
  try {
    const { DB } = env;
    const id = context.params.id;

    if (!id) {
      return new Response(JSON.stringify({ error: "ID de refugio requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let refugio = await DB.prepare("SELECT *, 'refugio' as tipo FROM refugios WHERE id = ?").bind(id).first();
    if (!refugio) {
      refugio = await DB.prepare("SELECT *, 'centro_acopio' as tipo FROM centros_acopio WHERE id = ?").bind(id).first();
    }
    if (!refugio) {
      refugio = await DB.prepare("SELECT *, 'hospital' as tipo FROM hospitales WHERE id = ?").bind(id).first();
    }

    if (!refugio) {
      return new Response(JSON.stringify({ error: "Refugio no encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(refugio), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al obtener detalle del refugio:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// PATCH /api/refugios/[id] - Actualizar necesidades, ocupación actual, etc.
export const PATCH: APIRoute = async (context) => {
  try {
    const { DB } = env;
    if (!DB) {
      return new Response(JSON.stringify({ error: "Base de datos no disponible." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verificar sesión de voluntario
    const sessionToken = context.cookies.get("session_token")?.value;
    const voluntario = await obtenerVoluntarioSesion(DB, sessionToken);
    if (!voluntario) {
      return new Response(JSON.stringify({ error: "Acceso no autorizado. Debe iniciar sesión como voluntario." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const id = context.params.id;
    const body = await context.request.json();

    if (!id) {
      return new Response(JSON.stringify({ error: "ID de refugio requerido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verificar existencia y determinar tabla
    let table = "";
    let existente = await DB.prepare("SELECT id FROM refugios WHERE id = ?").bind(id).first();
    if (existente) {
      table = "refugios";
    } else {
      existente = await DB.prepare("SELECT id FROM centros_acopio WHERE id = ?").bind(id).first();
      if (existente) {
        table = "centros_acopio";
      } else {
        existente = await DB.prepare("SELECT id FROM hospitales WHERE id = ?").bind(id).first();
        if (existente) {
          table = "hospitales";
        }
      }
    }

    if (!table) {
      return new Response(JSON.stringify({ error: "Registro no encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { 
      ocupacion_actual, 
      capacidad_maxima, 
      necesidades, 
      contacto, 
      direccion,
      encargado,
      ninos,
      bebes_lactantes,
      adultos_mayores,
      personal_profesional,
      voluntarios,
      inventario,
      latitud,
      longitud,
      fotos
    } = body;

    // Helper para verificar campos soportados
    const hasField = (fieldName: string) => {
      if (table === "refugios") return true;
      if (table === "centros_acopio") {
        return ["nombre", "direccion", "latitud", "longitud", "contacto", "necesidades", "inventario", "encargado", "fotos"].includes(fieldName);
      }
      if (table === "hospitales") {
        return ["nombre", "direccion", "latitud", "longitud", "contacto", "necesidades", "fotos"].includes(fieldName);
      }
      return false;
    };

    // Construir campos de actualización
    const fields: string[] = [];
    const params: any[] = [];

    if (ocupacion_actual !== undefined && hasField("ocupacion_actual")) {
      fields.push("ocupacion_actual = ?");
      params.push(parseInt(ocupacion_actual));
    }
    if (capacidad_maxima !== undefined && hasField("capacidad_maxima")) {
      fields.push("capacidad_maxima = ?");
      params.push(parseInt(capacidad_maxima));
    }
    if (necesidades !== undefined && hasField("necesidades")) {
      fields.push("necesidades = ?");
      params.push(necesidades ? necesidades.trim() : null);
    }
    if (contacto !== undefined && hasField("contacto")) {
      fields.push("contacto = ?");
      params.push(contacto ? contacto.trim() : null);
    }
    if (direccion !== undefined && hasField("direccion")) {
      fields.push("direccion = ?");
      params.push(direccion ? direccion.trim() : null);
    }
    if (encargado !== undefined && hasField("encargado")) {
      fields.push("encargado = ?");
      params.push(encargado ? encargado.trim() : null);
    }
    if (ninos !== undefined && hasField("ninos")) {
      fields.push("ninos = ?");
      params.push(ninos !== null ? parseInt(ninos) : 0);
    }
    if (bebes_lactantes !== undefined && hasField("bebes_lactantes")) {
      fields.push("bebes_lactantes = ?");
      params.push(bebes_lactantes !== null ? parseInt(bebes_lactantes) : 0);
    }
    if (adultos_mayores !== undefined && hasField("adultos_mayores")) {
      fields.push("adultos_mayores = ?");
      params.push(adultos_mayores !== null ? parseInt(adultos_mayores) : 0);
    }
    if (personal_profesional !== undefined && hasField("personal_profesional")) {
      fields.push("personal_profesional = ?");
      params.push(personal_profesional !== null ? parseInt(personal_profesional) : 0);
    }
    if (voluntarios !== undefined && hasField("voluntarios")) {
      fields.push("voluntarios = ?");
      params.push(voluntarios !== null ? parseInt(voluntarios) : 0);
    }
    if (inventario !== undefined && hasField("inventario")) {
      fields.push("inventario = ?");
      params.push(inventario ? (typeof inventario === 'string' ? inventario : JSON.stringify(inventario)) : null);
    }
    if (latitud !== undefined && hasField("latitud")) {
      fields.push("latitud = ?");
      params.push(latitud !== null && latitud !== "" ? parseFloat(latitud) : null);
    }
    if (longitud !== undefined && hasField("longitud")) {
      fields.push("longitud = ?");
      params.push(longitud !== null && longitud !== "" ? parseFloat(longitud) : null);
    }
    if (fotos !== undefined && hasField("fotos")) {
      fields.push("fotos = ?");
      params.push(fotos ? (typeof fotos === 'string' ? fotos : JSON.stringify(fotos)) : null);
    }

    if (fields.length === 0) {
      return new Response(JSON.stringify({ error: "No se proporcionaron campos válidos para actualizar." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Agregar fecha de censo y de actualización automáticas
    fields.push("fecha_registro = datetime('now')");
    fields.push("updated_at = datetime('now')");
    fields.push("updated_by = ?");
    params.push(voluntario.id);

    // Parámetro ID final
    params.push(id);

    const sql = `UPDATE ${table} SET ${fields.join(", ")} WHERE id = ?`;
    await DB.prepare(sql).bind(...params).run();

    // Loguear actividad
    await DB.prepare(`
      INSERT INTO historial_actividad (voluntario_id, accion, tabla, registro_id, created_at)
      VALUES (?, 'EDITAR', ?, ?, datetime('now'))
    `).bind(voluntario.id, table, id).run();

    // Enviar notificación push si hay cambio significativo
    try {
      const PUSH_QUEUE = env.PUSH_QUEUE;
      if (PUSH_QUEUE) {
        // Obtener refugio actualizado para determinar alertas
        let selectFields = "nombre";
        if (table === "refugios" || table === "centros_acopio") {
          selectFields += ", inventario";
        }
        if (table === "refugios") {
          selectFields += ", ocupacion_actual, capacidad_maxima";
        }

        const refugioActualizado = await DB.prepare(`SELECT ${selectFields} FROM ${table} WHERE id = ?`).bind(id).first<any>();
        if (refugioActualizado) {
          let alerta: { titulo: string; mensaje: string; tipo: "info" | "evacuacion" | "replica" } | null = null;

          // Verificar semáforo de inventario
          if (inventario && (table === "refugios" || table === "centros_acopio")) {
            try {
              const inv = typeof inventario === 'string' ? JSON.parse(inventario) : inventario;
              const criticos = Object.values(inv).filter(v => v === "Crítico");
              if (criticos.length > 0) {
                alerta = {
                  titulo: `🔴 ${refugioActualizado.nombre} — Estado Crítico`,
                  mensaje: `${criticos.length} insumos en nivel crítico. Se necesita ayuda urgente.`,
                  tipo: "info"
                };
              }
            } catch {}
          }

          // Verificar si está lleno (solo refugio)
          if (table === "refugios") {
            const ocup = ocupacion_actual !== undefined ? parseInt(ocupacion_actual) : refugioActualizado.ocupacion_actual;
            const cap = capacidad_maxima !== undefined ? parseInt(capacidad_maxima) : refugioActualizado.capacidad_maxima;
            if (ocup && cap && ocup >= cap) {
              alerta = {
                titulo: `⚠️ ${refugioActualizado.nombre} — Capacidad Llena`,
                mensaje: `El centro ha alcanzado su capacidad máxima (${ocup}/${cap} personas).`,
                tipo: "info"
              };
            }
          }

          if (alerta) {
            const subs = await DB.prepare(
              "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'voluntario'"
            ).all<{ endpoint: string; p256dh: string; auth: string }>();
            const suscripciones = subs.results || [];
            if (suscripciones.length > 0) {
              await PUSH_QUEUE.send({
                type: "push_batch",
                payload: {
                  titulo: alerta.titulo,
                  mensaje: alerta.mensaje,
                  tipo: alerta.tipo,
                  url: `/refugios/mapa?id=${id}`,
                },
                suscripciones: suscripciones.map(s => ({
                  endpoint: s.endpoint,
                  keys: { p256dh: s.p256dh, auth: s.auth },
                })),
              });
            }
          }
        }
      }
    } catch (pushErr) {
      console.error("Error al enviar push de refugio:", pushErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error al actualizar refugio:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
