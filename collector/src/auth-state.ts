import { z } from "zod";
import { BoundaryError } from "./errors.js";

const authStateSchema = z
  .object({ url: z.url(), loginRequiredVisible: z.boolean() })
  .readonly();
/** URL과 화면 표식을 함께 검증해 로그인 필요 상태를 판정한다. */
export class LoginStateDetector {
  needsLogin(input: unknown): boolean {
    const parsed = authStateSchema.safeParse(input);
    if (!parsed.success) throw new BoundaryError("invalid_auth_state");
    return (
      parsed.data.url.includes("/auth/signin") ||
      parsed.data.loginRequiredVisible
    );
  }
}
