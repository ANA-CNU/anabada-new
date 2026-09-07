import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const healthSchema = z
  .object({
    status: z.enum([
      "starting",
      "running",
      "idle",
      "failed",
      "stopped",
      "auth_required",
      "manual_recovery_required",
    ]),
    updatedAt: z.number().int().nonnegative(),
    lastStartedAt: z.number().int().nonnegative().nullable(),
    lastCompletedAt: z.number().int().nonnegative().nullable(),
    degraded: z.boolean(),
  })
  .readonly();
export type HealthState = z.infer<typeof healthSchema>;

/** Docker healthcheck가 읽는 상태 파일을 원자적으로 쓰고 검증한다. */
export class CollectorHealthStore {
  async write(
    profileDir: string,
    state: Omit<HealthState, "updatedAt">,
  ): Promise<void> {
    const path = join(profileDir, "collector-health.json");
    await writeFile(
      `${path}.tmp`,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
      { mode: 0o600 },
    );
    await rename(`${path}.tmp`, path);
  }

  async isHealthy(profileDir: string, maxAgeMs = 90000): Promise<boolean> {
    try {
      const state = healthSchema.parse(
        JSON.parse(
          await readFile(join(profileDir, "collector-health.json"), "utf8"),
        ),
      );
      const age = Date.now() - state.updatedAt;
      return (
        age >= 0 &&
        age <= maxAgeMs &&
        !state.degraded &&
        (state.status !== "running" ||
          (state.lastStartedAt !== null &&
            Date.now() - state.lastStartedAt <= 1800000)) &&
        (state.status === "running" || state.status === "idle")
      );
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }
}
