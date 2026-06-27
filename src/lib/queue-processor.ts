import { extraerEntidades, generarEmbedding, extraerNombresDeImagen } from "./ai";

export async function procesarCola(
  batch: MessageBatch<any>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const { type, data } = message.body;

      if (type === "persona") {
        if (data.cedula) {
          await env.DB.prepare(`
            INSERT INTO personas (
              cedula, nombre, apellido, edad, sexo, estado, 
              ubicacion_nombre, latitud, longitud, refugio, 
              contacto, notas, foto_key, fuente, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
              updated_at = datetime('now')
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
            data.fuente || "web"
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO personas (
              nombre, apellido, edad, sexo, estado, 
              ubicacion_nombre, latitud, longitud, refugio, 
              contacto, notas, foto_key, fuente
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.fuente || "web"
          ).run();
        }
      } 
      
      else if (type === "reporte") {
        const result = await env.DB.prepare(`
          INSERT INTO reportes (
            tipo, nombre_buscado, cedula_buscado, descripcion, 
            reportante_nombre, reportante_contacto, ubicacion_nombre, 
            latitud, longitud, foto_key
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          data.foto_key || null
        ).first<{ id: number }>();

        if (result && result.id) {
          const reporteId = result.id;
          
          // Si el reporte es de tipo 'encontrado', resolver reportes de búsqueda relacionados
          if (data.tipo === "encontrado") {
            if (data.cedula_buscado) {
              await env.DB.prepare(`
                UPDATE reportes 
                SET estado_reporte = 'resuelto', 
                    updated_at = datetime('now') 
                WHERE cedula_buscado = ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
              `).bind(data.cedula_buscado).run();
            }
            
            if (data.nombre_buscado && data.nombre_buscado.length > 3) {
              await env.DB.prepare(`
                UPDATE reportes 
                SET estado_reporte = 'resuelto', 
                    updated_at = datetime('now') 
                WHERE nombre_buscado LIKE ? AND tipo = 'desaparecido' AND estado_reporte = 'abierto'
              `).bind(`%${data.nombre_buscado}%`).run();
            }
          }
          
          try {
            // Intentar extraer entidades usando Llama 3.1
            const entidades = await extraerEntidades(env, data.descripcion);
            
            // Construir texto descriptivo normalizado para generar un embedding preciso
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

            // Guardar el embedding en Vectorize
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
            // No reintentamos si falló la IA pero guardó en base de datos.
            // Permite continuar el flujo sin colapsar la cola.
          }
        }
      }
      
      else if (type === "procesar_nombres_censo") {
        if (!data) {
          console.error("Payload 'data' faltante en procesar_nombres_censo:", message.body);
          message.ack();
          continue;
        }
        
        const { personas, refugio, contacto } = data;
        const personasRecibidas = personas as {nombre: string, cedula: number|null, telefono: string|null, edad: number|null}[];
        
        if (!personasRecibidas || !Array.isArray(personasRecibidas)) {
          console.error("Payload 'personas' inválido:", data);
          message.ack();
          continue;
        }
        
        console.log(`Procesando censo curado manualmente, total personas:`, personasRecibidas.length);

        const PUSH_QUEUE = (env as any).PUSH_QUEUE;

        for (const persona of personasRecibidas) {
          const nombreCompleto = persona.nombre;
          if (!nombreCompleto || nombreCompleto.trim().length < 3) continue;

          const cedula = persona.cedula || null;
          const tel = persona.telefono || null;
          const edad = persona.edad || null;
          const finalContacto = [tel, contacto].filter(Boolean).join(" - ");

          const partes = nombreCompleto.trim().split(/\s+/);
          const primerNombre = partes[0] || "";
          const primerApellido = partes[partes.length - 1] || "";

          // Buscar coincidencias en reportes de desaparecidos abiertos
          const queryTerm = `%${nombreCompleto.trim()}%`;
          const reportesCoincidentes = await env.DB.prepare(`
            SELECT * FROM reportes 
            WHERE tipo = 'desaparecido' 
              AND estado_reporte = 'abierto'
              AND (nombre_buscado LIKE ? 
                   OR (nombre_buscado LIKE ? AND nombre_buscado LIKE ?))
          `).bind(queryTerm, `%${primerNombre}%`, `%${primerApellido}%`).all<{ id: number; nombre_buscado: string; reportante_contacto: string }>();

          const matches = reportesCoincidentes.results || [];

          // Registrar persona encontrada en la tabla personas
          let personaId: number | null = null;
          try {
            const nombre = primerNombre;
            const apellido = partes.slice(1).join(" ");
            
            const insertPersona = await env.DB.prepare(`
              INSERT INTO personas (nombre, apellido, estado, refugio, contacto, cedula, edad, fuente, updated_at)
              VALUES (?, ?, 'vivo', ?, ?, ?, ?, 'escaner_ia', datetime('now'))
              RETURNING id
            `).bind(nombre, apellido || null, refugio, finalContacto || null, cedula ? String(cedula) : null, edad,).first<{ id: number }>();
            
            if (insertPersona) {
              personaId = insertPersona.id;
            }
          } catch (dbErr) {
            console.error("Error al registrar persona de la lista escaneada:", dbErr);
          }

          if (matches.length > 0) {
            console.log(`¡Coincidencia encontrada para ${nombreCompleto}! actualizando reportes...`);
            
            for (const reporte of matches) {
              // 3. Actualizar reporte en D1 a resuelto
              await env.DB.prepare(`
                UPDATE reportes 
                SET estado_reporte = 'resuelto', 
                    persona_id = ?,
                    updated_at = datetime('now') 
                WHERE id = ?
              `).bind(personaId, reporte.id).run();

              // 4. Enviar notificación push si hay PUSH_QUEUE
              if (PUSH_QUEUE) {
                const subRes = await env.DB.prepare(
                  "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE rol = 'familiar'"
                ).all<{ endpoint: string; p256dh: string; auth: string }>();

                const suscripciones = subRes.results || [];

                if (suscripciones.length > 0) {
                  const BATCH_SIZE = 50;
                  for (let i = 0; i < suscripciones.length; i += BATCH_SIZE) {
                    const batch = suscripciones.slice(i, i + BATCH_SIZE);
                    await PUSH_QUEUE.send({
                      type: "push_batch",
                      payload: {
                        titulo: "¡Familiar Encontrado!",
                        mensaje: `${reporte.nombre_buscado} ha sido registrado a salvo en el refugio: ${refugio}.`,
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
