import { extraerEntidades, generarEmbedding } from "./ai";

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

      message.ack();
    } catch (err) {
      console.error("Error al procesar mensaje en cola censo:", err);
      message.retry();
    }
  }
}
