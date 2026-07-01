import { extraerEntidades, generarEmbedding } from "./ai";
import { 
  upsertPersona, 
  insertReporte, 
  resolverReportesRelacionados, 
  procesarCensoBatch 
} from "./db";

export async function procesarCola(
  batch: MessageBatch<any>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const { type, data } = message.body;

      // ═══════════════════════════════════════════════════════════
      // 1. Procesar Persona Individual
      // ═══════════════════════════════════════════════════════════
      if (type === "persona") {
        await upsertPersona(env.DB, data);
      } 
      
      // ═══════════════════════════════════════════════════════════
      // 2. Procesar Reporte Individual
      // ═══════════════════════════════════════════════════════════
      else if (type === "reporte") {
        const reporteId = await insertReporte(env.DB, data);

        if (reporteId) {
          // Notificar administradores por Telegram
          try {
            const { notifyAdmins } = await import("./telegram/notify");
            const alertMsg = `🚨 <b>Nuevo Reporte Recibido (#${reporteId})</b>\n\n` +
              `• <b>Nombre buscado:</b> ${data.nombre_buscado || "Sin identificar"}\n` +
              `• <b>Cédula:</b> ${data.cedula_buscado || "No especificada"}\n` +
              `• <b>Tipo:</b> ${data.tipo}\n` +
              `• <b>Ubicación:</b> ${data.ubicacion_nombre || "No especificada"}\n\n` +
              `📝 <b>Descripción:</b> <i>"${data.descripcion}"</i>\n\n` +
              `🔗 <a href="https://dondeestan.org/admin/dashboard">Ir al Panel de Moderación</a>`;
            ctx.waitUntil(notifyAdmins(env, alertMsg));
          } catch (err) {
            console.error("Error al notificar admin por Telegram:", err);
          }
          // Notificar a usuarios de Telegram cercanos
          try {
            const { notificarCercanos } = await import("./telegram/notify");
            if (data.latitud && data.longitud) {
              const msg = `🚨 <b>NUEVO REPORTE EN TU ZONA</b>\n\n` +
                          `• Tipo: ${data.tipo}\n` +
                          `• Detalle: ${data.descripcion}\n\n` +
                          `🔗 <a href="https://dondeestan.org">Ver en el mapa</a>`;
              ctx.waitUntil(notificarCercanos(env, data.latitud, data.longitud, msg));
            }
          } catch (e) {
            console.error("Error al notificar a usuarios cercanos por Telegram:", e);
          }
          
          // Si el reporte es de tipo 'encontrado', la resolución en cascada de desaparecidos se realiza al aprobar en el panel.
          
          // Extraer entidades y guardar embeddings en Vectorize
          try {
            const entidades = await extraerEntidades(env, data.descripcion);
            
            const partes = [
              entidades.nombre || data.nombre_buscado || "",
              entidades.apellido || "",
              entidades.edad ? `${entidades.edad} años` : "",
              entidades.sexo || "",
              entidades.vestimenta || "",
              entidades.ubicacion || data.ubicacion_nombre || "",
              entidades.señas_particulares || ""
            ].filter(Boolean).join(", ");

            const textoEmbedding = partes || data.descripcion;
            const embedding = await generarEmbedding(env, textoEmbedding);

            await env.VECTOR_INDEX.upsert([
              {
                id: `reporte-${reporteId}`,
                values: embedding,
                metadata: {
                  tipo: data.tipo,
                  estado: "abierto",
                  reporte_id: reporteId,
                  descripcion: data.descripcion.substring(0, 500)
                }
              }
            ]);
          } catch (aiError) {
            console.error(`Error procesando IA para reporte ${reporteId}:`, aiError);
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // 3. Procesar Censo Masivo (Optimizado con Batching)
      // ═══════════════════════════════════════════════════════════
      else if (type === "procesar_nombres_censo") {
        if (!data) {
          console.error("Payload 'data' faltante en procesar_nombres_censo:", message.body);
          message.ack();
          continue;
        }
        
        const { personas, refugio, contacto, refugio_id, created_by } = data;
        const personasRecibidas = personas as {
          nombre: string;
          cedula: number | null;
          telefono: string | null;
          edad: number | null;
        }[];
        
        if (!personasRecibidas || !Array.isArray(personasRecibidas)) {
          console.error("Payload 'personas' inválido:", data);
          message.ack();
          continue;
        }
        
        console.log(`Procesando censo curado manualmente, total personas: ${personasRecibidas.length}`);

        const PUSH_QUEUE = (env as any).PUSH_QUEUE;

        // Ejecutar procesamiento masivo optimizado en D1
        const { results } = await procesarCensoBatch(
          env.DB, 
          personasRecibidas, 
          refugio, 
          contacto, 
          refugio_id || null,
          created_by || null
        );

        // Disparar notificaciones Push
        if (PUSH_QUEUE) {
          let familiarSubscriptions: any[] | null = null;

          for (const res of results) {
            if (res.matches.length > 0) {
              console.log(`Coincidencia encontrada para ${res.nombre}. Enviando notificaciones...`);
              
              // Cargar suscripciones de familiares bajo demanda (lazy-loading por lote)
              if (familiarSubscriptions === null) {
                try {
                  const subRes = await env.DB.prepare(
                    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'familiar'"
                  ).all<{ endpoint: string; p256dh: string; auth: string }>();
                  familiarSubscriptions = subRes.results || [];
                } catch (dbErr) {
                  console.error("Error al obtener suscripciones de push:", dbErr);
                  familiarSubscriptions = [];
                }
              }

              if (familiarSubscriptions.length > 0) {
                const BATCH_SIZE = 50;
                for (const reporte of res.matches) {
                  for (let i = 0; i < familiarSubscriptions.length; i += BATCH_SIZE) {
                    const batch = familiarSubscriptions.slice(i, i + BATCH_SIZE);
                    await PUSH_QUEUE.send({
                      type: "push_batch",
                      payload: {
                        titulo: "¡Familiar Encontrado!",
                        mensaje: `${reporte.nombre_buscado} ha sido registrado localizado en el refugio: ${refugio || "Refugio de emergencia"}.`,
                        tipo: "info",
                        url: `/?q=${encodeURIComponent(reporte.nombre_buscado)}`
                      },
                      suscripciones: batch.map((s) => ({
                        endpoint: s.endpoint,
                        keys: { p256dh: s.p256dh, auth: s.auth }
                      }))
                    });
                  }
                }
              }
            }
          }
        }
      }

      message.ack();
    } catch (err) {
      console.error("Error al procesar mensaje en cola censo:", err);
      message.retry();
    }
  }
}
