import assert from "node:assert/strict";
import test from "node:test";
import { LoginStateDetector } from "../src/auth-state.js";

const detector = new LoginStateDetector();

for (const [url, visible, expected] of [
  ["https://jungol.co.kr/auth/signin", false, true],
  ["https://jungol.co.kr/group/1125/submission", true, true],
  ["https://jungol.co.kr/group/1125/submission", false, false],
] as const) {
  test(`detects authentication state at ${url} with visible=${visible}`, () => {
    // Given
    const snapshot = { url, loginRequiredVisible: visible };
    // When
    const result = detector.needsLogin(snapshot);
    // Then
    assert.equal(result, expected);
  });
}
test("rejects malformed browser snapshot", () => {
  // Given / When / Then
  assert.throws(
    () => detector.needsLogin({ url: "bad", loginRequiredVisible: "false" }),
    { code: "invalid_auth_state" },
  );
});
