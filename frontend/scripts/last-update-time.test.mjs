import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../collector/package.json", import.meta.url));
const { chromium } = require("playwright");
const baseUrl = process.env.LAST_UPDATE_TIME_BASE_URL ?? "http://127.0.0.1:4174";
const frozenNow = "2026-09-16T08:31:43.000Z";

function freezeClock(page) {
  return page.addInitScript((now) => {
    const RealDate = Date;

    class FrozenDate extends RealDate {
      constructor(...args) {
        super(...(args.length === 0 ? [now] : args));
      }

      static now() {
        return new RealDate(now).getTime();
      }
    }

    window.Date = FrozenDate;
  }, frozenNow);
}

async function openHome(payload, status = 200) {
  const context = await browser.newContext({ timezoneId: "Asia/Seoul" });
  const page = await context.newPage();
  await freezeClock(page);
  await page.route("**/api/board/recently-date", (route) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  }));
  await page.route("**/api/v2/ranking/bias", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: [] }),
  }));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { context, page };
}

const browser = await chromium.launch({ headless: true });

try {
  {
    // 준비: 운영 응답 형식과 10분 뒤로 고정한 현재 시간
    const { context, page } = await openHome({
      success: true,
      data: { created_at: "2026-09-16T08:21:43.000Z" },
    });

    // 실행: 랭킹 보드가 업데이트 표시를 렌더링한다
    await page.getByText("마지막 업데이트:", { exact: false }).waitFor({ timeout: 5_000 });
    const update = page.getByText("마지막 업데이트: 10분 전", { exact: true });
    await update.waitFor({ timeout: 5_000 });
    await update.hover();

    // 검증: 상대 시간과 정확한 KST 시간을 모두 표시한다
    await page.getByText("2026년 9월 16일 17:21:43 KST", { exact: true }).last().waitFor({ timeout: 5_000 });
    await context.close();
  }

  for (const payload of [{ success: true, data: null }, { success: true }]) {
    // 준비: 업데이트 시각이 없는 API 성공 응답
    const { context, page } = await openHome(payload);

    // 실행: 컴포넌트가 요청을 완료한다
    await page.getByText("마지막 업데이트: 업데이트 기록 없음", { exact: true }).waitFor({ timeout: 5_000 });

    // 검증: UI에 빈 시각을 남기지 않는다
    assert.equal(await page.getByText("마지막 업데이트: ", { exact: true }).count(), 0);
    await context.close();
  }

  for (const [payload, status] of [
    [{ success: true, data: { created_at: "not-a-timestamp" } }, 200],
    [{ success: false }, 500],
  ]) {
    // 준비: 잘못된 형식 또는 실패한 엔드포인트 응답
    const { context, page } = await openHome(payload, status);

    // 실행: 컴포넌트가 요청을 완료한다
    await page.getByText("마지막 업데이트: 시간 조회 실패", { exact: true }).waitFor({ timeout: 5_000 });

    // 검증: 안정적인 사용자용 오류 상태를 표시한다
    assert.equal(await page.getByText(/Invalid Date/u).count(), 0);
    await context.close();
  }
} finally {
  await browser.close();
}
