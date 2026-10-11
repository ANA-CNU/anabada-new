import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { SubmissionTimestampReader } from "../src/jungol/submission-timestamp.js";

const row = (time: string, timestamp: string, wrapper = false) =>
  `<tr><td>1</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>${wrapper ? `<div role="button" tabindex="0">${time}</div>` : `<span>${time}</span>`}<span class="exact">${timestamp}</span></td></tr>`;

test("timestamp reader hovers plain time cells independently and retains wrapper compatibility", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<style>.exact{display:none}td:hover .exact,[role=button]:hover + .exact{display:inline}</style><table><tbody>${row("오후 5:26", "2026. 10. 8. 오후 5:26:34")}${row("오전 1:00", "2026. 9. 13. 오전 1:00:01")}${row("오전 2:00", "2026. 9. 13. 오전 2:00:01", true)}${row("오전", "")}</tbody></table>`,
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
