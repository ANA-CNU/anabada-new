import type { InitializedDatabase } from "../infrastructure/mysql/pool-factory.js";
import { BojMemberSettlement } from "./member-settlement.js";
import { type RankMember, syncBojMember } from "./member-sync.js";
import { withBojLease } from "./mysql-lease.js";
import { type BojPageReader, BojReadError } from "./page-reader.js";
import {
  BojSettlementRepository,
  type StoredMember,
} from "./settlement-repository.js";
import type { SolvedAcCollector } from "./solved-ac-collector.js";

const groupId = 13872;
const reconcileMs = 86_400_000;
const cycleBudgetMs = 240_000;
const maxPriorityMembers = 32;
const maxOtherMembers = 8;

type Reader = Pick<BojPageReader, "readGroupMembers" | "readSubmissionPage">;
type CycleOptions = {
  readonly solvedAc: Pick<SolvedAcCollector, "observe" | "readTiers">;
  readonly onMemberFailure: (error: Error) => Promise<void> | void;
  readonly now?: () => Date;
  readonly projectRanking?: (now: Date, signal: AbortSignal) => Promise<void>;
};
type Work = {
  readonly member: RankMember;
  readonly stored: StoredMember | undefined;
  readonly solvedHandle?: string;
};

export class BojCycleRunner {
  private readonly settlement: BojMemberSettlement;
  private readonly now: () => Date;

  constructor(
    private readonly database: InitializedDatabase,
    private readonly reader: Reader,
    private readonly options: CycleOptions,
  ) {
    this.settlement = new BojMemberSettlement(database.pool);
    this.now = options.now ?? (() => new Date());
  }

  async run(signal: AbortSignal) {
    return withBojLease(
      this.database.rawPool,
      "boj_bada:collector",
      async () => {
        const cycleStarted = this.now().getTime();
        const members = await this.reader.readGroupMembers(groupId, signal);
        if (!members.length) throw new BojReadError("invalid_roster");
        const rows = await this.database.pool.withSession((db) =>
          new BojSettlementRepository(db).members(
            members.map(({ handle }) => handle),
          ),
        );
        const byHandle = new Map(
          rows.map((row) => [row.handle.toLowerCase(), row]),
        );
        const confirmed = this.options.solvedAc.observe(
          members
            .filter(({ handle }) => !byHandle.has(handle.toLowerCase()))
            .map(({ handle }) => handle),
        );
        const priority: Work[] = [];
        const other: Work[] = [];
        const dueBefore = cycleStarted - reconcileMs;
        for (const member of members) {
          const handle = member.handle.toLowerCase();
          const stored = byHandle.get(handle);
          const solvedHandle = confirmed.get(handle);
          if (!stored && !solvedHandle) continue;
          const work = { member, stored, solvedHandle };
          if (
            stored?.baselineReady &&
            (stored.retry ||
              stored.submissions !== member.submissionCount ||
              stored.corrects !== member.solvedCount)
          )
            priority.push(work);
          else if (
            !stored?.baselineReady ||
            (stored.lastCheckedAt?.getTime() ?? 0) <= dueBefore
          )
            other.push(work);
        }
        const oldest = (a: Work, b: Work) =>
          (a.stored?.lastCheckedAt?.getTime() ?? 0) -
          (b.stored?.lastCheckedAt?.getTime() ?? 0);
        priority.sort(oldest);
        other.sort(oldest);
        let failed = 0;
        let processed = 0;
        for (const work of [
          ...priority.slice(0, maxPriorityMembers),
          ...other.slice(0, maxOtherMembers),
        ]) {
          signal.throwIfAborted();
          if (this.now().getTime() - cycleStarted >= cycleBudgetMs) break;
          try {
            await this.member(work, dueBefore, signal);
            processed += 1;
          } catch (error) {
            if (signal.aborted || !(error instanceof Error)) throw error;
            failed += 1;
            await this.options.onMemberFailure(error);
            if (
              error instanceof BojReadError &&
              [403, 429, 503].includes(error.status ?? 0)
            )
              break;
          }
        }
        signal.throwIfAborted();
        await this.options.projectRanking?.(this.now(), signal);
        return {
          members: members.length,
          processed,
          failed,
          remaining: priority.length + other.length - processed - failed,
        };
      },
    );
  }

  private async member(
    { member, stored, solvedHandle }: Work,
    dueBefore: number,
    signal: AbortSignal,
  ) {
    if (!stored?.baselineReady) {
      await this.baseline(member, stored, signal, solvedHandle);
      return;
    }
    await syncBojMember(
      {
        member,
        signal,
        checkpoint: {
          committedThrough: stored.solution,
          submissionCount: stored.submissions,
          solvedCount: stored.corrects,
          retryRequired: stored.retry,
        },
        reconcile: (stored.lastCheckedAt?.getTime() ?? 0) <= dueBefore,
      },
      {
        readPage: (request) => this.reader.readSubmissionPage(request),
        commit: async (input) => {
          const tiers = input.accepted.length
            ? await this.options.solvedAc.readTiers(
                member.handle,
                stored.solvedHandle,
                input.accepted.map(({ problemNumber }) => problemNumber),
                signal,
              )
            : undefined;
          await this.settlement.commit(input, tiers, this.now(), signal);
        },
      },
    );
  }

  private async baseline(
    member: RankMember,
    previous: StoredMember | undefined,
    signal: AbortSignal,
    solvedHandle?: string,
  ) {
    const top = previous?.baselineTop ?? null;
    const page = await this.reader.readSubmissionPage({
      handle: member.handle,
      top,
      signal,
    });
    if (
      top === null &&
      page.submissions.length === 0 &&
      page.nextTop === null &&
      member.submissionCount !== 0
    ) {
      await this.database.pool.unitOfWork(async (db) => {
        signal.throwIfAborted();
        await new BojSettlementRepository(db).deferEmptyBaseline(
          member,
          this.now(),
          solvedHandle,
        );
        signal.throwIfAborted();
      });
      return;
    }
    let upper = top;
    const solved: number[] = [];
    const first = page.submissions[0]?.id;
    const anchored =
      previous?.baseline && previous.baseline !== "0"
        ? previous.baseline
        : undefined;
    const head = anchored ?? first ?? "0";
    let pending = false;
    for (const [index, row] of page.submissions.entries()) {
      if (
        upper !== null &&
        (BigInt(row.id) > BigInt(upper) || (index > 0 && row.id === upper))
      )
        throw new BojReadError("invalid_roster");
      upper = row.id;
      if (row.verdict === "pending") pending = true;
      if (row.verdict === "accepted") solved.push(row.problemNumber);
    }
    if (
      (page.nextTop !== null &&
        (page.submissions.length === 0 ||
          upper === null ||
          BigInt(page.nextTop) >= BigInt(upper))) ||
      (page.submissions.length === 0 &&
        (top !== null || member.submissionCount !== 0))
    )
      throw new BojReadError("invalid_roster");
    if (pending && anchored) return;
    await this.database.pool.unitOfWork(async (db) => {
      signal.throwIfAborted();
      await new BojSettlementRepository(db).initialize({
        member,
        previous,
        head,
        nextTop: pending ? (first ?? null) : page.nextTop,
        solved: pending ? [] : solved,
        checkedAt: this.now(),
        solvedHandle,
      });
      signal.throwIfAborted();
    });
  }
}
