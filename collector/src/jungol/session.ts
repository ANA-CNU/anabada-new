import {
  type BrowserContext,
  chromium,
  errors,
  type Page,
  type Response,
} from "playwright";
import { LoginStateDetector } from "../auth-state.js";
import type { CollectorConfig, Credentials } from "../config.js";
import { JungolError, rejectJungolHttpStatus } from "./errors.js";
import { PageOperation } from "./page.js";
import type { JungolRequestCoordinator } from "./request-coordinator.js";

/** secure HttpOnly cookie를 읽지 않고 persistent Chromium context의 인증 상태만 소유한다. */
export class JungolSession {
  private constructor(
    readonly context: BrowserContext,
    private readonly config: CollectorConfig,
    private readonly requests: JungolRequestCoordinator,
    private readonly loginState = new LoginStateDetector(),
    private readonly pages = new PageOperation(),
  ) {}
  static async launch(
    config: CollectorConfig,
    requests: JungolRequestCoordinator,
  ): Promise<JungolSession> {
    try {
      const context = await chromium.launchPersistentContext(
        config.profileDir,
        { headless: config.headless, timeout: config.loginTimeoutMs },
      );
      context.setDefaultTimeout(config.pageTimeoutMs);
      await requests.configureContext(context, config.baseUrl);
      return new JungolSession(context, config, requests);
    } catch (error) {
      if (error instanceof Error) throw new JungolError("browser_failed");
      throw error;
    }
  }
  newPage(): Promise<Page> {
    return this.context.newPage();
  }
  close(): Promise<void> {
    return this.context.close();
  }
  async ensureLogin(
    credentials: Credentials,
    signal?: AbortSignal,
  ): Promise<void> {
    const page = await this.newPage();
    try {
      await this.pages.run(page, signal, async () => {
        const target = new URL(
          `/group/${this.config.groupId}/submission`,
          this.config.baseUrl,
        );
        const probe = await this.requests.schedule(
          "auth_probe",
          signal,
          async () =>
            page.goto(target.href, {
              waitUntil: "domcontentloaded",
              timeout: this.config.loginTimeoutMs,
            }),
        );
        this.requireOpenResponse(probe);
        await this.requireChallengeRecovery(page);
        const loginRequiredVisible = await page
          .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
          .first()
          .isVisible();
        if (
          !this.loginState.needsLogin({ url: page.url(), loginRequiredVisible })
        ) {
          await page
            .getByRole("table")
            .first()
            .waitFor({ state: "visible", timeout: this.config.loginTimeoutMs });
          await this.requireChallengeRecovery(page);
          return;
        }
        if (!page.url().includes("/auth/signin")) {
          const signin = new URL("/auth/signin", this.config.baseUrl);
          signin.searchParams.set(
            "next",
            Buffer.from(target.pathname).toString("base64"),
          );
          const signinResponse = await this.requests.schedule(
            "auth_probe",
            signal,
            async () =>
              page.goto(signin.href, {
                waitUntil: "domcontentloaded",
                timeout: this.config.loginTimeoutMs,
              }),
          );
          this.requireOpenResponse(signinResponse);
        }
        await this.requireChallengeRecovery(page);
        await page
          .getByLabel("아이디", { exact: true })
          .fill(credentials.username);
        await page
          .getByLabel("암호", { exact: true })
          .fill(credentials.password);
        const remember = page.getByRole("checkbox", { name: "로그인 유지" });
        if (await remember.isVisible()) await remember.check();
        let transportFailed = false;
        page.on("requestfailed", () => {
          transportFailed = true;
        });
        page.on("response", (response) => {
          if (response.status() >= 500) transportFailed = true;
        });
        try {
          await this.requests.schedule("auth_submit", signal, async () =>
            Promise.all([
              page.waitForURL((url) => url.pathname === target.pathname, {
                timeout: this.config.loginTimeoutMs,
              }),
              page.getByRole("button", { name: "로그인", exact: true }).click(),
            ]),
          );
        } catch (error) {
          if (signal?.aborted) throw error;
          await this.requireChallengeRecovery(page);
          if (
            error instanceof errors.TimeoutError &&
            !transportFailed &&
            page.url().includes("/auth/signin") &&
            (await page.getByLabel("암호", { exact: true }).isVisible())
          )
            throw new JungolError("auth_required");
          throw error;
        }
        await this.requireChallengeRecovery(page);
        if (
          await page
            .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
            .first()
            .isVisible()
        )
          throw new JungolError("auth_required");
        await page
          .getByRole("table")
          .first()
          .locator("tr")
          .nth(1)
          .waitFor({ state: "visible", timeout: this.config.loginTimeoutMs });
        if (
          await page
            .getByText(/로그인이 필요해요|그룹에 가입해야 해요/)
            .first()
            .isVisible()
        )
          throw new JungolError("auth_required");
      });
    } catch (error) {
      if (
        error instanceof JungolError &&
        error.code === "browser_failed" &&
        !page.isClosed() &&
        !signal?.aborted
      )
        await this.requireChallengeRecovery(page);
      throw error;
    } finally {
      await page.close();
    }
  }

  private async requireChallengeRecovery(page: Page): Promise<void> {
    const challengeUrl =
      /\/cdn-cgi\/challenge|\/captcha(?:\/|$)|\/challenge(?:\/|$)/i.test(
        new URL(page.url()).pathname,
      );
    const markers = page.locator(
      '.g-recaptcha, .h-captcha, .cf-turnstile, #challenge-form, #challenge-running, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]',
    );
    const challengeText = await page
      .getByText(
        /verify (?:that )?you are human|checking your browser|performing security verification|사람인지 확인|로봇이 아닙니다/i,
      )
      .first()
      .isVisible();
    let challengeVisible = false;
    for (const marker of await markers.all()) {
      if (await marker.isVisible()) challengeVisible = true;
    }
    if (challengeUrl || challengeVisible || challengeText)
      throw new JungolError("manual_recovery_required");
  }

  private requireOpenResponse(response: Response | null): void {
    rejectJungolHttpStatus(response?.status());
  }
}
