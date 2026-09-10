import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";
import { RankCollector } from "../src/jungol/rank.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const headers =
  "<tr><th>등수</th><th>계정</th><th>푼 문제</th><th>틀린 문제</th><th>스트릭</th><th>AC 레이팅</th></tr>";
const row =
  '<tr><td>1</td><td><a href="/account/42"></a><script>{ const chip = document.createElement("a"); chip.className = "chip"; chip.href = "/account/42"; chip.textContent = "member"; document.currentScript.previousElementSibling.append(chip); }</script></td><td>123문제</td><td>2문제</td><td>7일</td><td>45</td></tr>';

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

test("Given numeric AC ratings When collecting rank Then it preserves zero and maps the tier", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    const collector = new RankCollector(
      { baseUrl: "https://rank.test", pageTimeoutMs: 2000 },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );
    for (const [rating, acRating, tier] of [
      ["0", 0, 0],
      ["45", 45, 1],
    ] as const) {
      await page.route("https://rank.test/**", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<table>${headers}${row.replace("<td>45</td>", `<td>${rating}</td>`)}</table>`,
        }),
      );
      const [member] = await collector.collect(page, 1125);
      assert.equal(member?.acRating, acRating);
      assert.equal(member?.tier, tier);
      await page.unroute("https://rank.test/**");
    }
  } finally {
    await browser.close();
  }
});

test("Given an unavailable or malformed AC rating When collecting rank Then it fails closed", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    const collector = new RankCollector(
      { baseUrl: "https://rank.test", pageTimeoutMs: 2000 },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );
    for (const rating of ["", "-", "—", "1,,2", "abc"]) {
      await page.route("https://rank.test/**", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<table>${headers}${row.replace("<td>45</td>", `<td>${rating}</td>`)}</table>`,
        }),
      );
      await assert.rejects(collector.collect(page, 1125), {
        code: "invalid_rank",
      });
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

test("Given a nickname that differs from the linked login handle When collecting rank Then only the handle becomes Jungol metadata", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    await page.route("https://rank.test/**", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<table>${headers}<tr><td>1</td><td><a id="outer" href="/account/42"></a><script>{ const chip = document.createElement("a"); chip.className = "chip"; chip.href = "/account/42"; chip.innerHTML = "<span>External Nickname</span>login-handle<span>External Company</span>"; document.getElementById("outer").append(chip); }</script></td><td>123문제</td><td>2문제</td><td>7일</td><td>45</td></tr></table>`,
      }),
    );
    const collector = new RankCollector(
      { baseUrl: "https://rank.test", pageTimeoutMs: 2000 },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );

    const members = await collector.collect(page, 1125);

    assert.deepEqual(
      members.map((member) => ({
        accountId: member.accountId,
        jungolName: member.jungolName,
      })),
      [{ accountId: "42", jungolName: "login-handle" }],
    );
  } finally {
    await browser.close();
  }
});

test("Given an account link that is loading When its handle arrives Then collecting waits for the handle", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage();
    await page.route("https://rank.test/**", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<table>${headers}<tr><td>1</td><td><a id="account" href="/account/42"><span class="chip">로드 중...</span></a><script>setTimeout(() => { const account = document.getElementById("account"); const chip = document.createElement("a"); chip.className = "chip"; chip.href = "/account/42"; chip.innerHTML = "<span>External Nickname</span>login-handle<span>External Company</span>"; account.replaceChildren(chip); }, 25)</script></td><td>123문제</td><td>2문제</td><td>7일</td><td>45</td></tr></table>`,
      }),
    );
    const collector = new RankCollector(
      { baseUrl: "https://rank.test", pageTimeoutMs: 2000 },
      new JungolRequestCoordinator({ delay: async () => {} }),
    );

    const [member] = await collector.collect(page, 1125);

    assert.equal(member?.jungolName, "login-handle");
  } finally {
    await browser.close();
  }
});

test("Given an unavailable or mismatched account chip When collecting rank Then identity persistence fails closed", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  try {
    for (const fixture of [
      { href: "/account/42", text: "로드 중..." },
      { href: "/account/43", text: "login-handle" },
    ]) {
      const page = await browser.newPage();
      await page.route("https://rank.test/**", (route) =>
        route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<table>${headers}<tr><td>1</td><td><a id="outer" href="/account/42"></a><script>{ const chip = document.createElement("a"); chip.className = "chip"; chip.href = "${fixture.href}"; chip.textContent = "${fixture.text}"; document.getElementById("outer").append(chip); }</script></td><td>123문제</td><td>2문제</td><td>7일</td><td>45</td></tr></table>`,
        }),
      );
      const collector = new RankCollector(
        { baseUrl: "https://rank.test", pageTimeoutMs: 100 },
        new JungolRequestCoordinator({ delay: async () => {} }),
      );

      await assert.rejects(collector.collect(page, 1125), {
        code: "browser_failed",
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
