import { bootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const { app, boj, close } = await bootstrap();
  if (process.argv.includes("--boj-once")) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    try {
      if (!boj) {
        logger.error("boj.import_pending");
        process.exitCode = 1;
        return;
      }
      const result = await boj.runOnce(controller.signal);
      if (result) logger.info(result, "boj.cycle_complete");
      else logger.info("boj.collector_already_running");
      if (result?.failed) process.exitCode = 1;
    } finally {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
      await close();
    }
    return;
  }
  const port = Number(process.env.PORT ?? "3000");
  app.listen(port);
  const stopBoj = boj?.start();
  logger.info({ port }, "backend.server_started");
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      await stopBoj?.();
      await close();
      process.exit(0);
    } catch {
      logger.error("backend.shutdown_failed");
      process.exit(1);
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
void main().catch(() => {
  logger.error({ code: "bootstrap_failed" }, "backend.bootstrap_failed");
  process.exitCode = 1;
});
