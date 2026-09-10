import type { AccountId } from "./domain/sync.js";
import type { ProblemId, SubmissionId } from "./domain.js";

/** 그룹 AC 피드가 검증 뒤 저장 경계로 넘기는 최소 제출 정보다. */
export type GroupAcceptedSubmission = {
  readonly accountId: AccountId;
  readonly submissionId: SubmissionId;
  readonly problemId: ProblemId;
  readonly submittedAt: Date;
  readonly score: number | null;
};

/** 재시작에도 같은 상한을 유지하는 그룹 피드 수집 창이다. */
export type GroupCollectionWindow = {
  readonly upperSubmissionId: SubmissionId;
  readonly windowLowerCursor: SubmissionId | null;
  readonly paginationCursor: string | null;
};

/** 문제 메타데이터 cache가 준비되기 전의 보수적 난이도 추정기다. */
export class ProblemTierEstimator {
  async estimate_tier(_problemId: ProblemId): Promise<number> {
    return 0;
  }
}
