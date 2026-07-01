import { enviarPushNotificacion } from "./web-push-workers";
import type { VapidKeys, PushSubscription } from "./web-push-workers";

interface PushBatchMessage {
  type: "push_batch";
  payload: {
    titulo: string;
    mensaje: string;
    tipo: string;
    url: string;
  };
  suscripciones: PushSubscription[];
}

/**
 * Procesador de la cola push-queue.
 * Recibe batches de suscripciones y envía notificaciones push a cada una.
 * Si un endpoint retorna 404/410 (expirado), lo elimina de D1.
 */
export async function procesarColaPush(
  batch: MessageBatch<PushBatchMessage>,
  env: Env
): Promise<void> {
  const vapidKeys: VapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY || "",
    privateKey: env.VAPID_PRIVATE_KEY || "",
    subject: env.VAPID_SUBJECT || "mailto:admin@dondeestan.org",
  };

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("VAPID keys no configuradas. Abortando push.");
    for (const message of batch.messages) {
      message.ack(); // No reintentar si no hay keys
    }
    return;
  }

  for (const message of batch.messages) {
    try {
      const { payload, suscripciones } = message.body;

      const notificationPayload = JSON.stringify({
        titulo: payload.titulo,
        mensaje: payload.mensaje,
        tipo: payload.tipo,
        url: payload.url,
      });

      const endpointsExpirados: string[] = [];

      // Enviar a cada suscripción del batch
      for (const sub of suscripciones) {
        try {
          const result = await enviarPushNotificacion(
            sub,
            notificationPayload,
            vapidKeys
          );

          if (result.gone) {
            // Suscripción expirada — marcar para eliminar
            endpointsExpirados.push(sub.endpoint);
          }

          if (!result.success && !result.gone) {
            console.warn(
              `Push fallido para ${sub.endpoint.substring(0, 60)}...: HTTP ${result.status}`
            );
          }
        } catch (pushErr) {
          console.error(
            `Error enviando push a ${sub.endpoint.substring(0, 60)}...:`,
            pushErr
          );
        }
      }

      // Limpiar suscripciones expiradas de D1
      if (endpointsExpirados.length > 0) {
        try {
          const placeholders = endpointsExpirados.map(() => "?").join(",");
          await env.DB.prepare(
            `DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`
          )
            .bind(...endpointsExpirados)
            .run();
          console.log(
            `Eliminadas ${endpointsExpirados.length} suscripciones expiradas`
          );
        } catch (cleanupErr) {
          console.error("Error limpiando suscripciones expiradas:", cleanupErr);
        }
      }

      message.ack();
    } catch (err) {
      console.error("Error procesando batch de push:", err);
      message.retry();
    }
  }
}
