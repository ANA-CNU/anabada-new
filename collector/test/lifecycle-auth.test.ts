import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { CollectorConfigLoader } from "../src/config.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";
import { JungolSession } from "../src/jungol/session.js";

const login =
  '<label>아이디<input></label><label>암호<input type="password"></label><button onclick="window.login()">로그인</button>';

for (const scenario of [
  {
    name: "captcha before login",
    before: '<div class="g-recaptcha">CAPTCHA</div>',
    after: "",
    code: "manual_recovery_required",
  },
  {
    name: "turnstile after login",
    before: "",
    after: '<div class="cf-turnstile">Verify you are human</div>',
    code: "manual_recovery_required",
  },
  {
    name: "challenge URL after login",
    before: "",
    after: "url",
    code: "manual_recovery_required",
  },
  {
    name: "rejected login",
    before: "",
    after: "reject",
    code: "auth_required",
  },
  {
    name: "malformed login page",
    before: "malformed",
    after: "",
    code: "browser_failed",
  },
  {
    name: "network failure",
    before: "network",
    after: "",
    code: "browser_failed",
  },
  {
    name: "network failure during login",
    before: "",
    after: "network",
    code: "browser_failed",
  },
]) {
  test(`Given ${scenario.name} When authenticating Then reports ${scenario.code}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "jungol-auth-"));
    let session: JungolSession | undefined;
    t.after(async () => {
      try {
        await session?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
    const loader = new CollectorConfigLoader({
      profileDir: join(directory, "profile"),
      loginTimeoutMs: 700,
      pageTimeoutMs: 700,
    });
    const config = loader.parse({
      JUNGOL_USERNAME: "disposable-fixture",
      JUNGOL_PASSWORD: "disposable-fixture",
      DB_PASSWORD: "disposable-fixture",
    });
    const launch = chromium.launchPersistentContext.bind(chromium);
    t.mock.method(chromium, "launchPersistentContext", (profile: string) =>
      launch(profile, {
        headless: true,
        ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
      }),
    );
    session = await JungolSession.launch(
      config,
      new JungolRequestCoordinator(),
    );
    await session.context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (scenario.before === "network") return route.abort("connectionfailed");
      if (url.pathname === "/login-request")
        return route.abort("connectionfailed");
      if (url.pathname.endsWith("/submission"))
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `${scenario.before}<p>로그인이 필요해요</p>`,
        });
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body:
          scenario.before ||
          `${login}<script>window.login=()=>{${scenario.after === "url" ? 'location.href="/cdn-cgi/challenge-platform/test"' : scenario.after === "network" ? 'fetch("/login-request").catch(()=>{})' : scenario.after === "reject" ? "void 0" : `document.body.innerHTML=${JSON.stringify(scenario.after)}`}};</script>`,
      });
    });
    await assert.rejects(session.ensureLogin(config.credentials), {
      code: scenario.code,
    });
  });
}
