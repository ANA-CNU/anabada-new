import { z } from "zod";

export const submissionIdSchema = z
  .union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^[1-9][0-9]*$/),
  ])
  .transform(String)
  .brand("SubmissionId");
export const problemIdSchema = z.number().int().positive().brand("ProblemId");
export type SubmissionId = z.infer<typeof submissionIdSchema>;
export type ProblemId = z.infer<typeof problemIdSchema>;
export type Verdict =
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "runtime_error"
  | "compile_error"
  | "other";

/** 외부 제출 응답에서 저장과 cursor 판정에 필요한 값만 보존하는 불변 객체다. */
export class SubmissionAttempt {
  constructor(
    readonly submissionId: SubmissionId,
    readonly problemId: ProblemId,
    readonly verdict: Verdict,
    readonly score: number | null,
    readonly submittedAt: Date,
  ) {}
}

export type SubmissionPage = {
  readonly attempts: readonly SubmissionAttempt[];
  readonly paging: { readonly cursor: string; readonly more: boolean };
};
