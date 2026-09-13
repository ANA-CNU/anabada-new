export type JungolErrorCode =
  | "invalid_rank"
  | "duplicate_account"
  | "browser_failed"
  | "problem_metadata_timeout"
  | "problem_metadata_http_failed"
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
  | "account_summary_mismatch"
  | "group_feed_request_queue_wait_failed"
  | "group_feed_navigation_failed"
  | "group_feed_loadmore_failed"
  | "group_feed_responsewait_failed"
  | "group_feed_header_failed"
  | "group_feed_rows_failed"
  | "group_feed_filter_invalid"
  | "group_feed_table_timeout"
  | "group_feed_row_invalid"
  | "group_feed_timestamp_missing"
  | "group_feed_timestamp_hover_failed"
  | "group_feed_timestamp_parse_failed"
  | "group_feed_actor_unmatched"
  | "group_feed_rows_timeout"
  | "group_feed_cursor_not_found";

/** 원문 응답·URL·예외를 포함하지 않는 collector 전용 진단 단계다. */
export type SafeJungolStage =
  | "problem_metadata_readiness"
  | "problem_metadata_navigation"
  | "account_summary"
  | "account_summary_readiness"
  | "page_operation"
  | "request_queue_wait"
  | "navigation"
  | "loadmore"
  | "responsewait"
  | "status"
  | "fingerprint"
  | "bson"
  | "schema"
  | "header"
  | "rows"
  | "actor"
  | "cursor"
  | "group_feed_queue_wait"
  | "group_feed_navigation"
  | "group_feed_auth_check"
  | "group_feed_filter_check"
  | "group_feed_table_ready"
  | "group_feed_rows_parse"
  | "group_feed_actor_resolution"
  | "group_feed_load_more_click"
  | "group_feed_rows_growth_wait"
  | "group_feed_cursor_check"
  | "group_feed_timestamp_hover"
  | "group_feed_timestamp_parse";
export type SafeJungolReason =
  | "http"
  | "mismatch"
  | "timeout"
  | "network"
  | "auth"
  | "challenge"
  | "partial_row"
  | "missing_timestamp"
  | "internal";
export type SafeCodeLocation = {
  readonly method: string;
  readonly source: string;
  readonly line: number;
};
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
  readonly problemId?: number | undefined;
  readonly imageObserved?: boolean | undefined;
  readonly titleObserved?: boolean | undefined;
  readonly pageNumber?: number | undefined;
  readonly previousRowCount?: number | undefined;
  readonly currentRowCount?: number | undefined;
  readonly cellCount?: number | undefined;
  readonly descendantCellCount?: number | undefined;
  readonly rowIndex?: number | undefined;
  readonly hasSubmissionSid?: boolean | undefined;
  readonly rowVisible?: boolean | undefined;
  readonly lastSubmissionId?: string | undefined;
  readonly loadingVisible?: boolean | undefined;
  readonly location?: SafeCodeLocation | undefined;
  readonly originalErrorKind?:
    | "Error"
    | "TypeError"
    | "RangeError"
    | "TimeoutError"
    | undefined;
  readonly transportCode?:
    | "ECONNREFUSED"
    | "ECONNRESET"
    | "ENETUNREACH"
    | "ENOTFOUND"
    | "ETIMEDOUT"
    | undefined;
};

const diagnosticStages = new Set<SafeJungolStage>([
  "problem_metadata_readiness",
  "problem_metadata_navigation",
  "account_summary",
  "account_summary_readiness",
  "page_operation",
  "request_queue_wait",
  "navigation",
  "loadmore",
  "responsewait",
  "status",
  "fingerprint",
  "bson",
  "schema",
  "header",
  "rows",
  "actor",
  "cursor",
  "group_feed_queue_wait",
  "group_feed_navigation",
  "group_feed_auth_check",
  "group_feed_filter_check",
  "group_feed_table_ready",
  "group_feed_rows_parse",
  "group_feed_actor_resolution",
  "group_feed_load_more_click",
  "group_feed_rows_growth_wait",
  "group_feed_cursor_check",
  "group_feed_timestamp_hover",
  "group_feed_timestamp_parse",
]);
const diagnosticReasons = new Set<SafeJungolReason>([
  "http",
  "mismatch",
  "timeout",
  "network",
  "auth",
  "challenge",
  "partial_row",
  "missing_timestamp",
  "internal",
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
  problemId?: number | undefined;
  imageObserved?: boolean | undefined;
  titleObserved?: boolean | undefined;
  pageNumber?: number | undefined;
  previousRowCount?: number | undefined;
  currentRowCount?: number | undefined;
  cellCount?: number | undefined;
  descendantCellCount?: number | undefined;
  rowIndex?: number | undefined;
  hasSubmissionSid?: boolean | undefined;
  rowVisible?: boolean | undefined;
  lastSubmissionId?: string | undefined;
  loadingVisible?: boolean | undefined;
  location?: SafeCodeLocation | undefined;
  originalErrorKind?: SafeJungolDiagnostics["originalErrorKind"];
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
    "problemId",
    "pageNumber",
    "previousRowCount",
    "currentRowCount",
    "cellCount",
    "descendantCellCount",
    "rowIndex",
  ] as const;
  for (const field of fields) {
    const parsed = nonnegativeInteger(value[field]);
    if (parsed !== undefined) result[field] = parsed;
  }
  for (const field of [
    "imageObserved",
    "titleObserved",
    "hasSubmissionSid",
    "rowVisible",
  ] as const) {
    const observed = value[field];
    if (typeof observed === "boolean") result[field] = observed;
  }
  if (typeof value.loadingVisible === "boolean")
    result.loadingVisible = value.loadingVisible;
  if (
    typeof value.lastSubmissionId === "string" &&
    /^[0-9]{1,20}$/.test(value.lastSubmissionId)
  )
    result.lastSubmissionId = value.lastSubmissionId;
  const location = safeCodeLocation(value.location);
  if (location) result.location = location;
  if (
    value.originalErrorKind === "Error" ||
    value.originalErrorKind === "TypeError" ||
    value.originalErrorKind === "RangeError" ||
    value.originalErrorKind === "TimeoutError"
  )
    result.originalErrorKind = value.originalErrorKind;
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

const safeCodeLocation = (
  value: SafeCodeLocation | undefined,
): SafeCodeLocation | undefined => {
  if (
    !value ||
    !/^[A-Za-z][A-Za-z0-9_.]{0,159}$/.test(value.method) ||
    !/^collector\/(src|dist)\/(?!.*\.\.)[A-Za-z0-9_./-]+\.(ts|js)$/.test(
      value.source,
    ) ||
    !Number.isSafeInteger(value.line) ||
    value.line < 1
  )
    return undefined;
  return { method: value.method, source: value.source, line: value.line };
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
