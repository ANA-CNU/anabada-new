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
  | "jungol_http_rejected";
export class JungolError extends Error {
  override readonly name = "JungolError";
  constructor(readonly code: JungolErrorCode) {
    super(code);
  }
}

export const rejectJungolHttpStatus = (status: number | undefined): void => {
  if (status === 403 || status === 429)
    throw new JungolError("jungol_http_rejected");
};
