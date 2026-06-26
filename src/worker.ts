import { handle } from "@astrojs/cloudflare/handler";
import { procesarCola } from "./lib/queue-processor";

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
    ctx.waitUntil(procesarCola(batch, env, ctx));
  }
} satisfies ExportedHandler<Env>;
