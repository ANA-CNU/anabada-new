import { z } from "zod";
import type { ProblemId, SubmissionId } from "../domain.js";

export const accountIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .brand("AccountId");
export type AccountId = z.infer<typeof accountIdSchema>;
export const groupMemberSchema = z
  .object({
    accountId: accountIdSchema,
    jungolName: z.string().trim().min(1).max(50),
    tier: z.number().int().min(0).max(31),
  })
  .readonly();
export type GroupMemberSnapshot = z.infer<typeof groupMemberSchema>;
export type SyncMode = "initial_summary" | "incremental";

/**
 * 사용자 한 명의 동기화 경계와 정합성 기대값을 전달하는 실행 계획이다.
 *
 * `initial_summary`는 첫 submission API page만 cursor로 읽으므로 `maxPages`가 항상 1이고,
 * `incremental`만 cursor 이후 이력 pagination의 상한을 사용한다.
 */
export class AccountSyncPlan {
  constructor(
    readonly mode: SyncMode,
    readonly member: GroupMemberSnapshot,
    readonly cursorBefore: bigint,
    readonly expectedSolvedDelta: number,
    readonly maxPages: number,
  ) {}
}

/** 브라우저 수집을 끝낸 뒤 transaction에 넘기는 AC 제출 데이터다. */
export class AcceptedAttempt {
  constructor(
    readonly submissionId: SubmissionId,
    readonly problemId: ProblemId,
    readonly problemName: string | null,
    readonly problemTier: number,
    readonly submittedAt: Date,
    readonly score: number | null,
    /** 수집 시점 메타데이터가 없으면 0인 보수적 추정 난이도다. */
    readonly estimatedTier: number = 0,
  ) {}

  /** 실제 1~31 티어를 우선하고 0·비정상값은 추정 티어를 사용한다. */
  get effectiveTier(): number {
    return isKnownProblemTier(this.problemTier)
      ? this.problemTier
      : this.estimatedTier;
  }
}

/** 0은 메타데이터 미확인을 뜻하므로 정산 전 추정 fallback 대상으로만 취급한다. */
export function isKnownProblemTier(tier: number): boolean {
  return Number.isSafeInteger(tier) && tier >= 1 && tier <= 31;
}

/** 처음 가입한 계정은 과거 제출을 재생하지 않고 해결 목록만 기준선으로 저장한다. */
export class InitialSolvedProblem {
  constructor(readonly problemId: ProblemId) {}
}

/** 그룹 멤버 화면이 확정한 초기 기준선이다. */
export class AccountInitialSnapshot {
  constructor(
    readonly plan: AccountSyncPlan,
    readonly solved: readonly InitialSolvedProblem[],
    readonly highestInspectedSubmissionId: bigint,
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

  get description(): string {
    return this.ruleType === "daily"
      ? `#${this.problemNumber}를 해결하여, 일일 점수 획득`
      : `이벤트 ID #event${this.eventId} 문제를 풀어 점수 획득`;
  }
}
