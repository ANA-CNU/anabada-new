import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { CollectorConfigLoader } from "../src/config.js";
import { JungolSession } from "../src/jungol/session.js";

test(
  "persistent Chromium profile reuses the server-issued HttpOnly session",
  { timeout: 15_000 },
  async (t) => {
    let loginCount = 0;
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/auth/signin" && request.method === "POST") {
        loginCount += 1;
        response.writeHead(302, {
          location: "/group/1125/submission",
          "set-cookie": "session=fixture; HttpOnly; Path=/; Max-Age=3600",
        });
        response.end();
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      if (url.pathname === "/auth/signin") {
        response.end(
          '<form method="post"><label>아이디<input name="username"></label><label>암호<input name="password" type="password"></label><label>로그인 유지<input type="checkbox"></label><button>로그인</button></form>',
        );
        return;
      }
      if (url.pathname === "/group/1125/submission") {
        response.end(
          request.headers.cookie?.includes("session=fixture")
            ? "<table><tr><th>제출</th></tr><tr><td>인증됨</td></tr></table>"
            : "<main>로그인이 필요해요</main>",
        );
        return;
      }
      response.end("<main>not found</main>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const directory = await mkdtemp(join(tmpdir(), "collector-profile-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const loader = new CollectorConfigLoader({
      profileDir: join(directory, "profile"),
      loginTimeoutMs: 5000,
      pageTimeoutMs: 5000,
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    const parsed = loader.parse({
      JUNGOL_USERNAME: "fixture-only",
      JUNGOL_PASSWORD: "fixture-only",
      DB_PASSWORD: "fixture-only",
    });
    const config = parsed;
    const credentials = parsed.credentials;
    const launch = chromium.launchPersistentContext.bind(chromium);
    t.mock.method(chromium, "launchPersistentContext", (profile: string) =>
      launch(profile, {
        headless: true,
        ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
      }),
    );
    const first = await JungolSession.launch(config);
    await first.ensureLogin(credentials);
    await first.close();
    const second = await JungolSession.launch(config);
    await second.ensureLogin(credentials);
    await second.close();
    assert.equal(loginCount, 1);
  },
);
