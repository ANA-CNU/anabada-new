import type { CycleTraceSnapshot } from "./cycle-diagnostics.js";

export class AtomicCycleFailure extends Error {
  constructor(
    readonly cause: unknown,
    readonly cycleTrace: CycleTraceSnapshot,
  ) {
    super("atomic_cycle_failed");
    this.name = "AtomicCycleFailure";
  }
}
