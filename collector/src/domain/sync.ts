import { z } from "zod";
import type { ProblemId, SubmissionId } from "../domain.js";

export const accountIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .brand("AccountId");
export type AccountId = z.infer<typeof accountIdSchema>;
const rawRankMemberSchema = z
  .object({
    accountId: accountIdSchema,
    jungolName: z.string().trim().min(1),
    solvedCount: z.number().int().nonnegative().safe(),
    wrongCount: z.number().int().nonnegative().safe(),
    acRating: z.number().int().nonnegative().safe(),
    tier: z.number().int().min(0).max(31),
  })
  .readonly();

/** 랭킹 페이지에서 검증된 사용자 메타데이터 한 시점을 캡슐화한다. */
export class RankMemberSnapshot {
  constructor(
    readonly accountId: AccountId,
    readonly jungolName: string,
    readonly solvedCount: number,
    readonly wrongCount: number,
    readonly acRating: number,
    readonly tier: number,
  ) {}
}

export const rankMemberSchema = rawRankMemberSchema.transform(
  (member) =>
    new RankMemberSnapshot(
      member.accountId,
      member.jungolName,
      member.solvedCount,
      member.wrongCount,
      member.acRating,
      member.tier,
    ),
);
export type RankMember = z.infer<typeof rankMemberSchema>;
export type SyncMode = "initial_backfill" | "incremental";

/** 사용자 한 명의 증분 범위와 정합성 기대값을 함께 전달하는 실행 계획이다. */
export class AccountSyncPlan {
  constructor(
    readonly mode: SyncMode,
    readonly member: RankMemberSnapshot,
    readonly cursorBefore: bigint,
    readonly expectedSolvedDelta: number,
    readonly maxPages: number,
  ) {}
}

export type AccountSyncState = {
  readonly solvedCount: number;
  readonly lastSubmissionId: bigint;
};

/** 브라우저 수집을 끝낸 뒤 transaction에 넘기는 AC 제출 데이터다. */
export class AcceptedAttempt {
  constructor(
    readonly submissionId: SubmissionId,
    readonly problemId: ProblemId,
    readonly problemName: string | null,
    readonly problemTier: number,
    readonly submittedAt: Date,
    readonly score: number | null,
  ) {}
}

/** 네트워크 작업과 DB transaction 사이의 완전한 사용자 수집 결과다. */
export class AccountCrawlResult {
  constructor(
    readonly plan: AccountSyncPlan,
    readonly acceptedAttempts: readonly AcceptedAttempt[],
    readonly highestInspectedSubmissionId: bigint,
    readonly scannedAttemptCount: number,
    readonly pageCount: number,
  ) {}
}

export type ScoreRule = "daily" | "event";

/** 점수 정책이 만들고 저장소만 INSERT할 수 있는 멱등 점수 명령이다. */
export class ScoreAward {
  readonly bias = 1;

  constructor(
    readonly ruleType: ScoreRule,
    readonly awardKey: string,
    readonly userId: number,
    readonly problemRowId: number,
    readonly problemNumber: number,
    readonly eventId: number | null,
    readonly scoreDay: string,
    readonly createdAt: Date,
  ) {}
}
