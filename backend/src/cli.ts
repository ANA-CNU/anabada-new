import { bootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const app = await bootstrap();
  const port = Number(process.env.PORT ?? "3000");
  app.listen(port);
  logger.info({ port }, "backend.server_started");
}
void main().catch((error: unknown) => {
  logger.error({ err: error }, "backend.bootstrap_failed");
  process.exitCode = 1;
});
