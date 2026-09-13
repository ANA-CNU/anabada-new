import type { AcceptedAttempt } from "./domain/sync.js";
import type { DailyScoreDecision } from "./scoring/daily.js";

export type SettlementAttemptOutcome = {
  readonly accountId: string;
  readonly jungolName: string;
  readonly problemId: number;
  readonly submissionId: string;
  readonly submittedAt: Date;
  readonly daily: SettlementDailyOutcome;
  readonly eventIds: readonly number[];
};

export type SettlementDailyOutcome =
  | { readonly kind: "awarded"; readonly scoreDay: string }
  | {
      readonly kind: "not_awarded";
      readonly reason:
        | "initial_cutoff"
        | "repeat_solve"
        | "daily_already_awarded";
    }
  | {
      readonly kind: "not_awarded";
      readonly reason: "tier_too_low";
      readonly problemTier: number;
      readonly userTier: number;
    };

export function orderAcceptedAttempts(
  attempts: readonly AcceptedAttempt[],
): readonly AcceptedAttempt[] {
  return [...attempts].sort(
    (left, right) =>
      left.submittedAt.getTime() - right.submittedAt.getTime() ||
      (BigInt(left.submissionId) < BigInt(right.submissionId) ? -1 : 1),
  );
}

export function dailyOutcomeFromDecision(
  decision: Extract<DailyScoreDecision, { readonly kind: "no_award" }>,
): SettlementDailyOutcome {
  return decision.reason === "tier_too_low"
    ? {
        kind: "not_awarded",
        reason: decision.reason,
        problemTier: decision.problemTier,
        userTier: decision.userTier,
      }
    : { kind: "not_awarded", reason: decision.reason };
}
