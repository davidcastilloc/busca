import { handle } from "@astrojs/cloudflare/handler";
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
    if (batch.queue === "push-queue") {
      await procesarColaPush(batch, env);
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    await processHourlyAlerts(env);
  }
} satisfies ExportedHandler<Env>;
