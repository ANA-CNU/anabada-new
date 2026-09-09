import { bootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const { app, close } = await bootstrap();
  const port = Number(process.env.PORT ?? "3000");
  app.listen(port);
  logger.info({ port }, "backend.server_started");
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
void main().catch(() => {
  logger.error({ code: "bootstrap_failed" }, "backend.bootstrap_failed");
  process.exitCode = 1;
});
