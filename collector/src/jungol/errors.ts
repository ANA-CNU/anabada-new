export type JungolErrorCode =
  | "invalid_rank"
  | "duplicate_account"
  | "browser_failed"
  | "cancelled"
  | "login_failed"
  | "auth_required"
  | "manual_recovery_required"
  | "submission_http_failed"
  | "submission_order_invalid"
  | "submission_cursor_stale"
  | "max_pages_reached_before_cursor"
  | "invalid_plan"
  | "closed"
  | "jungol_http_rejected"
  | "account_summary_invalid"
  | "account_summary_http_failed"
  | "account_summary_mismatch";

/** 원문 응답·URL·예외를 포함하지 않는 collector 전용 진단 단계다. */
export type SafeJungolStage =
  | "account_summary"
  | "account_summary_readiness"
  | "page_operation";
export type SafeJungolReason = "http" | "mismatch" | "timeout" | "network";
export type SafeJungolDiagnostics = {
  readonly stage: SafeJungolStage;
  readonly reason: SafeJungolReason;
  readonly rankSolvedCount?: number | undefined;
  readonly profileSolvedCount?: number | undefined;
  readonly observedLinkCount?: number | undefined;
  readonly distinctLinkCount?: number | undefined;
  readonly expectedCount?: number | undefined;
  readonly httpStatus?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly transportCode?:
    | "ECONNREFUSED"
    | "ECONNRESET"
    | "ENETUNREACH"
    | "ENOTFOUND"
    | "ETIMEDOUT"
    | undefined;
};

const diagnosticStages = new Set<SafeJungolStage>([
  "account_summary",
  "account_summary_readiness",
  "page_operation",
]);
const diagnosticReasons = new Set<SafeJungolReason>([
  "http",
  "mismatch",
  "timeout",
  "network",
]);
const transportCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);
const nonnegativeInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
type SafeJungolDiagnosticsDraft = {
  stage: SafeJungolStage;
  reason: SafeJungolReason;
  rankSolvedCount?: number | undefined;
  profileSolvedCount?: number | undefined;
  observedLinkCount?: number | undefined;
  distinctLinkCount?: number | undefined;
  expectedCount?: number | undefined;
  httpStatus?: number | undefined;
  timeoutMs?: number | undefined;
  transportCode?: SafeJungolDiagnostics["transportCode"];
};

/** 알림 경계에서 allowlist와 정수 범위를 다시 적용해 raw 진단값을 차단한다. */
const safeDiagnostics = (
  value: SafeJungolDiagnostics | undefined,
): SafeJungolDiagnostics | undefined => {
  if (
    !value ||
    !diagnosticStages.has(value.stage) ||
    !diagnosticReasons.has(value.reason)
  )
    return undefined;
  const result: SafeJungolDiagnosticsDraft = {
    stage: value.stage,
    reason: value.reason,
  };
  const fields = [
    "rankSolvedCount",
    "profileSolvedCount",
    "observedLinkCount",
    "distinctLinkCount",
    "expectedCount",
    "timeoutMs",
  ] as const;
  for (const field of fields) {
    const parsed = nonnegativeInteger(value[field]);
    if (parsed !== undefined) result[field] = parsed;
  }
  if (
    typeof value.httpStatus === "number" &&
    Number.isInteger(value.httpStatus) &&
    value.httpStatus >= 100 &&
    value.httpStatus <= 599
  )
    result.httpStatus = value.httpStatus;
  if (value.transportCode && transportCodes.has(value.transportCode))
    result.transportCode = value.transportCode;
  return result;
};
export class JungolError extends Error {
  override readonly name = "JungolError";
  readonly diagnostics: SafeJungolDiagnostics | undefined;
  constructor(
    readonly code: JungolErrorCode,
    diagnostics?: SafeJungolDiagnostics,
  ) {
    super(code);
    this.diagnostics = safeDiagnostics(diagnostics);
  }
}

export const rejectJungolHttpStatus = (status: number | undefined): void => {
  if (status === 403 || status === 429)
    throw new JungolError("jungol_http_rejected");
};
