import { handle } from "@astrojs/cloudflare/handler";
import { procesarCola } from "./lib/queue-processor";
import { procesarColaPush } from "./lib/push-queue-processor";
import { processHourlyAlerts } from "./lib/telegram/cron";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return await handle(request, env, ctx);
  },

  async queue(
    batch: MessageBatch<any>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // Discriminar por nombre de cola
    if (batch.queue === "push-queue") {
      ctx.waitUntil(procesarColaPush(batch, env));
    } else {
      // censo-queue (default)
      ctx.waitUntil(procesarCola(batch, env, ctx));
    }
  },

  async scheduled(
    event: any,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(processHourlyAlerts(env));
  }
} satisfies ExportedHandler<Env>;
