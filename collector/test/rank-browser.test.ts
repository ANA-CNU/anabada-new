import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";
import { RankCollector } from "../src/jungol/rank.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const headers =
  "<tr><th>등수</th><th>계정</th><th>푼 문제</th><th>틀린 문제</th><th>스트릭</th><th>AC 레이팅</th></tr>";
const row =
  '<tr><td>1</td><td><a href="/account/42">member</a></td><td>123문제</td><td>2문제</td><td>7일</td><td>45</td></tr>';

test("Given ambiguous counts When collecting rank Then malformed grouping is rejected", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    const collector = new RankCollector(
      {
        baseUrl: "https://rank.test",
        pageTimeoutMs: 2000,
      },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );
    for (const value of [
      "1,,234문제",
      "12,34문제",
      "123,문제",
      "1.5문제",
      "-1문제",
      "1 234문제",
      "123 arbitrary",
      "123일",
      "123문제 arbitrary",
    ]) {
      await page.route("https://rank.test/**", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<table><tr><th>등수</th><th>계정</th><th>푼 문제</th><th>틀린 문제</th><th>스트릭</th><th>AC 레이팅</th></tr><tr><td>1</td><td><a href="/account/42">member</a></td><td>${value}</td><td>2문제</td><td>0일</td><td>45</td></tr></table>`,
        }),
      );
      await assert.rejects(
        collector.collect(page, 1125),
        { code: "invalid_rank" },
        value,
      );
      await page.unroute("https://rank.test/**");
    }
  } finally {
    await browser.close();
  }
});

test("Given duplicate accounts or changed columns When collecting rank Then schema drift fails closed", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    const collector = new RankCollector(
      {
        baseUrl: "https://rank.test",
        pageTimeoutMs: 2000,
      },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );
    for (const fixture of [
      {
        html: `<table>${headers}${row}${row}</table>`,
        code: "duplicate_account",
      },
      {
        html: `<table>${headers.replace("<th>스트릭</th><th>AC 레이팅</th>", "<th>AC 레이팅</th><th>스트릭</th>")}${row}</table>`,
        code: "invalid_rank",
      },
      {
        html: `<table>${headers}${row.replace("<td>45</td>", "<td>45점</td>")}</table>`,
        code: "invalid_rank",
      },
      {
        html: `<table>${headers}${row.replace("<td>45</td>", "<td>4,,500</td>")}</table>`,
        code: "invalid_rank",
      },
      {
        html: `<table>${headers}${row.replace("<td>7일</td>", "")}</table>`,
        code: "invalid_rank",
      },
    ]) {
      await page.route("https://rank.test/**", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: fixture.html,
        }),
      );
      await assert.rejects(collector.collect(page, 1125), {
        code: fixture.code,
      });
      await page.unroute("https://rank.test/**");
    }
  } finally {
    await browser.close();
  }
});
