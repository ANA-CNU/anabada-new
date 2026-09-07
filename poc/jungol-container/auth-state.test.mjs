import assert from "node:assert/strict";
import test from "node:test";
import { needsLogin } from "./auth-state.mjs";

test("group access-denied DOM requires login even when URL does not redirect", () => {
  assert.equal(
    needsLogin({
      url: "https://jungol.co.kr/group/1125/submission",
      loginRequiredVisible: true,
    }),
    true,
  );
});

test("sign-in URL requires login", () => {
  assert.equal(
    needsLogin({
      url: "https://jungol.co.kr/auth/signin",
      loginRequiredVisible: false,
    }),
    true,
  );
});

test("authenticated group DOM does not require login", () => {
  assert.equal(
    needsLogin({
      url: "https://jungol.co.kr/group/1125/submission",
      loginRequiredVisible: false,
    }),
    false,
  );
});
