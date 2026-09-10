import { mkdir } from "node:fs/promises";
import { CollectorService } from "./application/service.js";
import { SyncCycle } from "./application/sync-cycle.js";
import type { CollectorConfig } from "./config.js";
import { CycleLifecycleReporter } from "./cycle-lifecycle-reporter.js";
import {
  CollectorIncidentFactory,
  EmergencyWebhookNotifier,
} from "./emergency-alert.js";
import { CollectorHealthStore, type HealthState } from "./health.js";
import { CollectorLoggerFactory, ErrorCodeSanitizer } from "./logger.js";
import { CollectorPoolFactory } from "./mysql/pool.js";
import { DiscordWebhookClient } from "./webhook.js";

type CycleFactory = (
  runtime: ConstructorParameters<typeof SyncCycle>[0],
) => Pick<SyncCycle, "run" | "close"> & {
  readonly currentStage?: () => string | undefined;
};
type RuntimeScheduling = Pick<
  ConstructorParameters<typeof CollectorService>[0],
  "delay" | "now"
>;

/** collector 프로세스 수명과 health 상태를 소유하고 cycle 업무는 SyncCycle에 위임한다. */
export class CollectorRuntime {
  constructor(
    private readonly config: CollectorConfig,
    private readonly createCycle: CycleFactory = (runtime) =>
      new SyncCycle(runtime),
    private readonly scheduling: RuntimeScheduling = {},
  ) {}

  async run(): Promise<void> {
    const config = this.config;
    const credentials = config.credentials;
    await mkdir(config.profileDir, { recursive: true, mode: 0o700 });
    const logger = new CollectorLoggerFactory().create();
    const errors = new ErrorCodeSanitizer();
    const incidents = new CollectorIncidentFactory();
    const emergencyWebhook = new EmergencyWebhookNotifier(
      config.emergencyWebhookUrl,
      new DiscordWebhookClient(),
      logger,
    );
    const health = new CollectorHealthStore();
    const pool = new CollectorPoolFactory().create(config, credentials);
    const cycle = this.createCycle({
      config,
      credentials,
      pool,
      logger,
      randomSeed: config.randomSeed,
    });
    const lifecycle = new CycleLifecycleReporter({
      url: config.emergencyWebhookUrl,
      transport: new DiscordWebhookClient(),
      logger,
      stage: () => cycle.currentStage?.(),
    });
    let status: HealthState["status"] = "starting";
    let lastStartedAt: number | null = null;
    let lastCompletedAt: number | null = null;
    let degraded = false;
    let healthWrites = Promise.resolve();
    const updateHealth = () => {
      const state = { status, lastStartedAt, lastCompletedAt, degraded };
      healthWrites = healthWrites.then(() =>
        health.write(config.profileDir, state),
      );
      return healthWrites;
    };
    let shutdownTimer: NodeJS.Timeout | undefined;
    let activeCycle: ReturnType<CycleLifecycleReporter["start"]> | undefined;
    const service = new CollectorService({
      intervalMs: config.intervalMs,
      runOnce: config.runOnce,
      ...this.scheduling,
      cycle: async (signal) => {
        let completedAt: number | null = null;
        if (lastStartedAt === null) await updateHealth();
        status = "running";
        lastStartedAt = Date.now();
        await updateHealth();
        activeCycle = lifecycle.start(new Date(lastStartedAt));
        try {
          const summary = await cycle.run(signal);
          completedAt = Date.now();
          status =
            summary.status === "success" || summary.status === "skipped_overlap"
              ? "idle"
              : summary.status === "auth_required" ||
                  summary.status === "manual_recovery_required"
                ? summary.status
                : "failed";
          lastCompletedAt = completedAt;
          degraded = status !== "idle";
          await updateHealth();
          await lifecycle.complete(activeCycle, summary, new Date(completedAt));
          const incident = incidents.fromCycle(summary);
          if (incident) await emergencyWebhook.notify(incident, signal);
        } catch (error) {
          status = "failed";
          const code = errors.code(error);
          logger.error({ code }, "collector.cycle_failed");
          await emergencyWebhook.notify(
            incidents.runtime(
              code,
              "collector cycle 실행 중 처리되지 않은 오류가 발생했습니다.",
            ),
            signal,
          );
        } finally {
          await lifecycle.stop(activeCycle);
          activeCycle = undefined;
          if (status === "running") status = "failed";
          lastCompletedAt = completedAt ?? Date.now();
          degraded = status !== "idle";
          await updateHealth();
          if (config.runOnce && degraded) process.exitCode = 1;
        }
        if (
          status === "auth_required" ||
          status === "manual_recovery_required"
        ) {
          logger.warn({ code: status }, "collector.circuit_opened");
          return "circuit_open";
        }
        return "continue";
      },
      close: async () => {
        try {
          await cycle.close();
        } finally {
          await pool.end();
        }
      },
    });
    const stop = () => {
      if (shutdownTimer) return;
      logger.info("collector.shutdown_requested");
      void lifecycle.stop(activeCycle);
      service.stop();
      shutdownTimer = setTimeout(() => {
        logger.error({ code: "shutdown_timeout" }, "collector.shutdown_failed");
        const forceExit = setTimeout(() => process.exit(1), 5000);
        forceExit.unref();
        void emergencyWebhook
          .notify(
            incidents.runtime(
              "shutdown_timeout",
              "collector가 종료 요청 후 30초 안에 작업을 정리하지 못했습니다.",
            ),
            new AbortController().signal,
          )
          .finally(() => process.exit(1));
      }, 30000);
      shutdownTimer.unref();
    };
    let heartbeat: NodeJS.Timeout | undefined;
    let heartbeatEnabled = true;
    const scheduleHeartbeat = () => {
      heartbeat = setTimeout(() => {
        void updateHealth()
          .catch(async (error: unknown) => {
            const code = errors.code(error);
            logger.error({ code }, "collector.health_write_failed");
            await emergencyWebhook.notify(
              incidents.runtime(
                code,
                "collector health 상태를 기록하지 못해 정상 동작 여부를 확인할 수 없습니다.",
              ),
              new AbortController().signal,
            );
            process.exitCode = 1;
            stop();
          })
          .finally(() => {
            if (heartbeatEnabled) scheduleHeartbeat();
          });
      }, 30000);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    try {
      logger.info("collector.started");
      status = "idle";
      await updateHealth();
      scheduleHeartbeat();
      await service.run();
    } finally {
      heartbeatEnabled = false;
      if (heartbeat) clearTimeout(heartbeat);
      try {
        await healthWrites;
        status = "stopped";
        await updateHealth();
        logger.info("collector.stopped");
        if (config.runOnce && degraded) process.exitCode = 1;
      } finally {
        if (shutdownTimer) clearTimeout(shutdownTimer);
        process.off("SIGTERM", stop);
        process.off("SIGINT", stop);
      }
    }
  }
}
