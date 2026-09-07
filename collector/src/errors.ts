export type BoundaryErrorCode =
  | "invalid_fingerprint"
  | "invalid_bson"
  | "invalid_envelope"
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
