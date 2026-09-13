import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollectorConfigLoader } from "../src/config.js";
import { JungolSession } from "../src/jungol/session.js";
import {
  asyncBrowserFixture,
  FetchGate,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

for (const scenario of [
  "authenticated",
  "challenge",
  "login_required",
  "pending",
  "hidden_challenge",
] as const) {
  test(`Given an auth table shell When hydration returns ${scenario} Then login detection waits for actual content`, async (t) => {
    // Given
    const gate = new FetchGate();
    const { settings, requests } = await asyncBrowserFixture(
      t,
      `<main><table><tr><th>제출</th></tr></table>${scenario === "hidden_challenge" ? '<div class="cf-turnstile" style="display:none"></div>' : ""}</main><script>fetch('/fixture/auth').then(r=>r.text()).then(html=>document.querySelector('main').innerHTML=html)</script>`,
      new Map([["/fixture/auth", gate]]),
    );
    const profileDir = await mkdtemp(join(tmpdir(), "async-auth-"));
    let session: JungolSession | undefined;
    t.after(async () => {
      try {
        await session?.close();
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    });
    const config = new CollectorConfigLoader({
      ...settings,
      profileDir,
      loginTimeoutMs: 800,
    }).parse({
      DB_PASSWORD: "fixture-only",
      JUNGOL_USERNAME: "fixture-only",
      JUNGOL_PASSWORD: "fixture-only",
    });
    session = await JungolSession.launch(config, requests);
    const operation = tracked(session.ensureLogin(config.credentials));
    // When
    await gate.requested;
    const authPage = session.context.pages().at(-1);
    assert.ok(authPage);
    await authPage.waitForLoadState("load");
    if (scenario !== "pending" && scenario !== "hidden_challenge")
      gate.release(
        scenario === "authenticated"
          ? "<table><tr><th>제출</th></tr><tr><td>12345</td></tr></table>"
          : scenario === "challenge"
            ? '<form id="challenge-form">Verify you are human</form>'
            : "<main>로그인이 필요해요</main>",
      );
    const result = await operation.result;
    // Then: 로그인 폼이 없는 fixture에서도 성공으로 오인하면 안 된다.
    if (scenario === "authenticated") assert.ok(result.ok);
    else {
      assert.equal(
        result.ok,
        false,
        "an empty table does not prove authentication",
      );
      if (!result.ok && scenario === "challenge")
        assert.equal(
          Reflect.get(Object(result.error), "code"),
          "manual_recovery_required",
        );
    }
  });
}
