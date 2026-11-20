import type { InitializedDatabase } from "../infrastructure/mysql/pool-factory.js";
import { logger } from "../logger.js";
import { withBojLease } from "./mysql-lease.js";
import {
  type SolvedAcFailure,
  claimSolvedAcJob,
  finishSolvedAcRequest,
  waitForSolvedAcSlot,
} from "./solved-ac-provider.js";
import {
  type ProblemMetadata,
  type SettlementTiers,
  SolvedAcClient,
  type SolvedAcCredentials,
  type SolvedAcReply,
} from "./solved-ac.js";
import { BojSolvedHistory } from "./solved-history.js";
import {
  type ProfileCheck,
  checkSolvedProfile,
} from "./solved-profile-browser.js";

const jobIntervalMs = 30_000;
const missingRetryMs = 3_600_000;
type Candidate = {
  readonly handle: string;
  nextAt: number;
  solvedHandle?: string;
};

export class SolvedAcSettlementError extends Error {
  readonly name = "SolvedAcSettlementError";
  constructor(
    readonly reason:
      | "unconfigured"
      | "busy"
      | "missing"
      | SolvedAcFailure["kind"],
  ) {
    super(reason);
  }
}

export type SolvedAcCollectorOptions = {
  readonly credentials?: SolvedAcCredentials;
  readonly checkProfile?: (
    handle: string,
    signal: AbortSignal,
  ) => Promise<ProfileCheck>;
  readonly request?: (url: URL, init: RequestInit) => Promise<Response>;
};

export class SolvedAcCollector {
  private candidates = new Map<string, Candidate>();
  private rosterExpiresAt = 0;
  private readonly checkProfile: NonNullable<
    SolvedAcCollectorOptions["checkProfile"]
  >;
  private readonly client?: SolvedAcClient;
  private readonly history?: BojSolvedHistory;
  private nextHistoryAttempt = 0;
  private nextAdmissionAttempt = 0;

  constructor(
    private readonly database: InitializedDatabase,
    options: SolvedAcCollectorOptions = {},
  ) {
    const client =
      options.credentials &&
      new SolvedAcClient(options.credentials, options.request);
    this.client = client;
    if (client) this.history = new BojSolvedHistory(database.pool, client);
    this.checkProfile = options.checkProfile ?? checkSolvedProfile;
  }

  observe(handles: readonly string[]): ReadonlyMap<string, string> {
    const roster = new Map<string, Candidate>();
    const confirmed = new Map<string, string>();
    for (const handle of handles) {
      const key = handle.toLowerCase();
      const candidate = this.candidates.get(key) ?? { handle, nextAt: 0 };
      roster.set(key, candidate);
      if (candidate.solvedHandle) confirmed.set(key, candidate.solvedHandle);
    }
    this.candidates = roster;
    this.rosterExpiresAt = Date.now() + 20 * 60_000;
    return confirmed;
  }

  async readTiers(
    handle: string,
    solvedHandle: string | null,
    numbers: readonly number[],
    signal: AbortSignal,
  ): Promise<SettlementTiers> {
    const client = this.client;
    if (!client) throw new SolvedAcSettlementError("unconfigured");
    const tiers = await withBojLease(
      this.database.rawPool,
      "boj_bada:solved-ac",
      async () => {
        const profile = await this.readFresh(signal, () =>
          client.profile(handle, signal, solvedHandle ?? handle),
        );
        const problems = new Map<number, ProblemMetadata>();
        for (const number of new Set(numbers)) {
          const metadata = await this.readFresh(signal, () =>
            client.problem(number, signal),
          );
          problems.set(number, metadata);
        }
        return { profile, problems };
      },
    );
    if (!tiers) throw new SolvedAcSettlementError("busy");
    return tiers;
  }

  private async readFresh<T>(
    signal: AbortSignal,
    request: () => Promise<SolvedAcReply<T>>,
  ): Promise<T> {
    signal.throwIfAborted();
    const { pool } = this.database;
    if (!(await waitForSolvedAcSlot(pool, signal)))
      throw new SolvedAcSettlementError("cooldown");
    signal.throwIfAborted();
    const result = await request();
    await pool.withSession((db) => finishSolvedAcRequest(db, result));
    signal.throwIfAborted();
    if (result.kind !== "resolved")
      throw new SolvedAcSettlementError(result.kind);
    return result.value;
  }

  private async refreshAdmission(signal: AbortSignal) {
    const now = Date.now();
    if (now < this.nextAdmissionAttempt || now >= this.rosterExpiresAt) return;
    const candidate = await claimSolvedAcJob(this.database.pool, async () => {
      let next: Candidate | undefined;
      for (const item of this.candidates.values())
        if (
          !item.solvedHandle &&
          item.nextAt <= now &&
          (!next || item.nextAt < next.nextAt)
        )
          next = item;
      return next;
    });
    if (!candidate) return;
    const result = await this.checkProfile(candidate.handle, signal);
    await this.database.pool.withSession((db) =>
      finishSolvedAcRequest(db, result),
    );
    this.nextAdmissionAttempt = Date.now() + jobIntervalMs;
    if (result.kind === "resolved") candidate.solvedHandle = result.handle;
    if (result.kind === "missing")
      candidate.nextAt = Date.now() + missingRetryMs;
    if (result.kind === "retry" || result.kind === "cooldown")
      candidate.nextAt = Date.now() + result.delay * 1_000;
    if (result.kind === "retry") logger.warn("boj.solved_ac_profile_retry");
    return result.kind;
  }

  async refreshOne(signal: AbortSignal): Promise<"blocked" | undefined> {
    signal.throwIfAborted();
    const result = await withBojLease<"blocked" | undefined>(
      this.database.rawPool,
      "boj_bada:solved-ac",
      async () => {
        const admission = await this.refreshAdmission(signal);
        if (admission) return admission === "blocked" ? "blocked" : undefined;
        if (this.history && Date.now() >= this.nextHistoryAttempt) {
          const outcome = await this.history.refreshOne(signal);
          if (outcome !== "idle") {
            this.nextHistoryAttempt = Date.now() + jobIntervalMs;
            return outcome === "blocked" ? "blocked" : undefined;
          }
        }
        return undefined;
      },
    );
    return result ?? undefined;
  }
}
