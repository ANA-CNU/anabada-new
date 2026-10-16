import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { SubmissionTimestampReader } from "../src/jungol/submission-timestamp.js";

const row = (time: string, timestamp: string, wrapper = false) =>
  `<tr><td>1</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>${wrapper ? `<div role="button" tabindex="0">${time}</div>` : `<span>${time}</span>`}<span class="exact">${timestamp}</span></td></tr>`;
const currentRow =
  '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td><div role="button" tabindex="0">시각</div><span class="exact">2026. 10. 8. 오후 5:26:34</span></td><td><span>코드 길이</span></td></tr>';

test("timestamp reader hovers plain time cells independently and retains wrapper compatibility", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>.exact{display:none}td:hover .exact,[role=button]:hover + .exact{display:inline}</style><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>코드 길이</th><th>언어</th><th>시각</th></tr></thead><tbody>${row("오후 5:26", "2026. 10. 8. 오후 5:26:34")}${row("오전 1:00", "2026. 9. 13. 오전 1:00:01")}${row("오전 2:00", "2026. 9. 13. 오전 2:00:01", true)}${row("오전", "")}</tbody></table>`,
    );
    const reader = new SubmissionTimestampReader(500);
    const rows = page.locator("tbody tr");
    assert.equal(
      (await reader.read(page, rows.nth(0))).submittedAt.toISOString(),
      "2026-10-08T08:26:34.000Z",
    );
    assert.equal(
      (await reader.read(page, rows.nth(1))).submittedAt.toISOString(),
      "2026-09-12T16:00:01.000Z",
    );
    assert.equal(
      (await reader.read(page, rows.nth(2))).submittedAt.toISOString(),
      "2026-09-12T17:00:01.000Z",
    );
    await assert.rejects(
      () => reader.read(page, rows.nth(3)),
      /group_feed_timestamp_hover_failed/,
    );
  } finally {
    await browser.close();
  }
});

test("timestamp reader follows the current 시각 header instead of the final combined column", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>.exact{display:none}[role=button]:hover + .exact{display:inline}</style><table><thead><tr><th>번호</th><th>제출자</th><th>문제</th><th>결과</th><th>시간</th><th>메모리</th><th>언어</th><th>시각</th><th>번호 · 코드 길이  번호, 코드 길이</th></tr></thead><tbody>${currentRow}</tbody></table>`,
    );
    assert.equal(
      (
        await new SubmissionTimestampReader(500).read(
          page,
          page.locator("tbody tr"),
        )
      ).submittedAt.toISOString(),
      "2026-10-08T08:26:34.000Z",
    );
  } finally {
    await browser.close();
  }
});
