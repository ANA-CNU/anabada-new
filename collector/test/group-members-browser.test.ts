import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";
import { GroupMemberCollector } from "../src/jungol/group-members.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const baseUrl = "https://members.test";
const member = (accountId: number, image = ""): string =>
  `<a href="/account/${accountId}">member-${accountId}${image}</a>`;
const article = (content: string): string =>
  `<article><h2>멤버</h2><div>${content}</div></article>`;

async function collect(html: string) {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" }),
  });
  const page = await browser.newPage();
  await page.route(`${baseUrl}/**`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
  );
  const collector = new GroupMemberCollector(
    { baseUrl, pageTimeoutMs: 1_000 },
    new JungolRequestCoordinator({ delay: async () => {} }),
  );
  try {
    return await collector.collect(page, 1125);
  } finally {
    await browser.close();
  }
}

test("Given loading member buttons When the final member links hydrate Then collection waits for the final list", async () => {
  const members = await collect(
    article(
      `<section id="members"><button>로드 중</button>${member(1, '<img src="https://s.jungol.co.kr/solved/1.svg">')}</section><script>setTimeout(() => document.querySelector('#members').innerHTML = '${member(1, '<img src="https://s.jungol.co.kr/solved/1.svg">')}${member(2, '<img src="https://s.jungol.co.kr/solved/11.svg">')}', 500)</script>`,
    ),
  );
  assert.deepEqual(
    members.map((value) => [value.accountId, value.tier]),
    [
      ["1", 1],
      ["2", 11],
    ],
  );
});

test("Given an unrelated article heading before the member heading When collecting members Then the exact member heading selects that article", async () => {
  const members = await collect(
    `<article><h3>그룹 정보</h3><h2>멤버</h2><div>${member(7)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given an account link before the member heading When collecting members Then only following member cards are collected", async () => {
  const members = await collect(
    `<article><h3>그룹 정보</h3>${member(1)}<h2>멤버</h2><div>${member(7)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given owner and member sections When collecting members Then both bounded sections are included once", async () => {
  const members = await collect(
    `<article><h2>소유자</h2><div>${member(2)}${member(1)}</div><h2>멤버</h2><div>${member(1)}${member(7)}</div><h2>다른 영역</h2><div>${member(9)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "1", jungolName: "member-1", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given the same owner and member card When collecting members Then the shared account is deduplicated", async () => {
  const members = await collect(
    `<article><h2>소유자</h2><div>${member(2)}</div><h2>멤버</h2><div>${member(2)}${member(7)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given conflicting owner and member cards for one account When collecting members Then the duplicate account fails closed", async () => {
  for (const conflictingCard of [
    '<a href="/account/2">other-name</a>',
    '<a href="/account/2">member-2<img src="https://s.jungol.co.kr/solved/1.svg"></a>',
  ])
    await assert.rejects(
      collect(
        `<article><h2>소유자</h2><div>${member(2)}</div><h2>멤버</h2><div>${conflictingCard}</div></article>`,
      ),
      { code: "duplicate_account" },
    );
});

test("Given owner cards still loading When member cards are ready Then collection waits for owner cards", async () => {
  const members = await collect(
    `<article><h2>소유자</h2><div id="owner"><button>로드 중</button></div><h2>멤버</h2><div>${member(7)}</div><script>setTimeout(() => document.querySelector('#owner').innerHTML = '${member(2)}', 500)</script></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given unrelated account links before and after group sections When collecting members Then only owner and member section cards are collected", async () => {
  const members = await collect(
    `<article>${member(99)}<h2>소유자</h2><div>${member(2)}</div><h2>멤버</h2><div>${member(7)}</div><h2>다른 영역</h2><div>${member(8)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given a loading button before the member heading When member cards are ready Then the unrelated button does not block collection", async () => {
  const members = await collect(
    `<article><h3>그룹 정보</h3><button>로드 중</button><h2>멤버</h2><div>${member(7)}</div></article>`,
  );
  assert.deepEqual(members, [
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given a member without a tier icon When collecting members Then direct handle and normal tier zero are retained", async () => {
  const members = await collect(
    article(
      '<a href="/account/42"><img src="https://assets.test/badge.svg"><span>nickname</span>member-42</a>',
    ),
  );
  assert.deepEqual(members, [
    { accountId: "42", jungolName: "member-42", tier: 0 },
  ]);
});

test("Given a nested member-card button handle When collecting members Then the button text is retained", async () => {
  const members = await collect(
    article(
      '<a href="/account/42"><div><button>nested-handle<span>affiliation</span><span>nickname</span></button></div></a>',
    ),
  );
  assert.deepEqual(members, [
    { accountId: "42", jungolName: "nested-handle", tier: 0 },
  ]);
});

test("Given the official sprout-1 tier image When collecting members Then it maps to tier zero", async () => {
  const members = await collect(
    article(
      member(42, '<img src="https://s.jungol.co.kr/solved/sprout-1.svg">'),
    ),
  );
  assert.deepEqual(members, [
    { accountId: "42", jungolName: "member-42", tier: 0 },
  ]);
});

test("Given an empty, malformed, or duplicate tier image When collecting members Then the boundary fails closed", async () => {
  for (const image of [
    '<img src="">',
    '<img src="https://s.jungol.co.kr/solved/32.svg">',
    '<img src="https://s.jungol.co.kr/solved/broken.svg">',
    '<img src="https://s.jungol.co.kr/solved/sprout-2.svg">',
    '<img src="https://s.jungol.co.kr/solved/1.svg"><img src="https://s.jungol.co.kr/solved/2.svg">',
    '<img src="https://s.jungol.co.kr/solved/sprout-1.svg"><img src="https://s.jungol.co.kr/solved/1.svg">',
  ])
    await assert.rejects(collect(article(member(42, image))), {
      code: "invalid_group_members",
    });
});
