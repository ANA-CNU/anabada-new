export type BoundaryErrorCode =
  | "invalid_fingerprint"
  | "invalid_bson"
  | "invalid_envelope"
  | "group_feed_invalid_cursor"
  | "group_feed_http_failed"
  | "group_feed_non_ac_result"
  | "duplicate_group_actor"
  | "group_actor_unresolved"
  | "invalid_auth_state"
  | "invalid_config"
  | "invalid_secret"
  | "secret_read_failed";

export class BoundaryError extends Error {
  override readonly name = "BoundaryError";
  constructor(readonly code: BoundaryErrorCode) {
    super(code);
  }
}
