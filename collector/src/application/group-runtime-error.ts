import { JungolError } from "../jungol/errors.js";
import { ErrorCodeSanitizer } from "../logger.js";

/** 외부 failure report에는 허용된 코드만 전달한다. */
export class GroupRuntimeErrorPolicy {
  private readonly errors = new ErrorCodeSanitizer();

  isCircuit(error: unknown): boolean {
    return (
      error instanceof JungolError &&
      (error.code === "auth_required" ||
        error.code === "manual_recovery_required" ||
        error.code === "login_failed")
    );
  }

  code(error: unknown): string {
    return this.errors.code(error);
  }
}
