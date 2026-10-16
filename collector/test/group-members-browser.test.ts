import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";
import { GroupMemberCollector } from "../src/jungol/group-members.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

const baseUrl = "https://members.test";
const member = (accountId: number, image = ""): string =>
  `<a href="/account/${accountId}">member-${accountId}${image}</a>`;
const groupPeople = (
  owner: string,
  members: string,
  memberCount: number,
  outside = "",
): string =>
  `<a href="/account/99">outside-before</a><section class="group-card group-people"><div class="people-section"><h2>소유자</h2><div class="people">${owner}</div></div><div class="people-section"><h2>멤버 ${memberCount}명</h2><div class="people">${members}</div></div><div class="people-section"><h2>다른 영역</h2><div class="people">${outside}</div></div></section><a href="/account/98">outside-after</a>`;

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

test("Given loading member cards When the advertised list hydrates Then collection waits for its final count", async () => {
  const owner = member(1, '<img src="https://s.jungol.co.kr/solved/1.svg">');
  const finalMembers = `${member(2, '<img src="https://s.jungol.co.kr/solved/11.svg">')}${member(3)}`;
  const members = await collect(
    groupPeople(
      owner,
      `<div id="members"><button>로드 중</button></div><script>setTimeout(() => document.querySelector('#members').innerHTML = '${finalMembers}', 500)</script>`,
      2,
    ),
  );
  assert.deepEqual(
    members.map((value) => [value.accountId, value.tier]),
    [
      ["1", 1],
      ["2", 11],
      ["3", 0],
    ],
  );
});

test("Given owner and member people sections When collecting members Then both direct sections are included once", async () => {
  const members = await collect(
    groupPeople(`${member(2)}${member(1)}`, `${member(1)}${member(7)}`, 2),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "1", jungolName: "member-1", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given the same owner and member card When collecting members Then the shared account is deduplicated", async () => {
  const members = await collect(
    groupPeople(member(2), `${member(2)}${member(7)}`, 2),
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
    await assert.rejects(collect(groupPeople(member(2), conflictingCard, 1)), {
      code: "duplicate_account",
    });
});

test("Given owner cards still loading When member cards are ready Then collection waits for owner cards", async () => {
  const members = await collect(
    groupPeople(
      `<div id="owner"><button>로드 중</button></div><script>setTimeout(() => document.querySelector('#owner').innerHTML = '${member(2)}', 500)</script>`,
      member(7),
      1,
    ),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given an empty owner section When member cards are ready Then collection does not report false success", async () => {
  await assert.rejects(collect(groupPeople("", member(7), 1)), {
    code: "group_members_timeout",
  });
});

test("Given fewer member cards than the advertised count When collecting members Then readiness times out", async () => {
  await assert.rejects(collect(groupPeople(member(2), member(7), 2)), {
    code: "group_members_timeout",
  });
});

test("Given unrelated account links before and after group sections When collecting members Then only owner and member section cards are collected", async () => {
  const members = await collect(
    groupPeople(member(2), member(7), 1, member(8)),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given a loading button outside the owner and member people containers When cards are ready Then it does not block collection", async () => {
  const members = await collect(
    `<button>로드 중</button>${groupPeople(member(2), member(7), 1)}`,
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "7", jungolName: "member-7", tier: 0 },
  ]);
});

test("Given a member without a tier icon When collecting members Then direct handle and normal tier zero are retained", async () => {
  const members = await collect(
    groupPeople(
      member(2),
      '<a href="/account/42"><img src="https://assets.test/badge.svg"><span>nickname</span>member-42</a>',
      1,
    ),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "42", jungolName: "member-42", tier: 0 },
  ]);
});

test("Given a nested member-card button handle When collecting members Then the button text is retained", async () => {
  const members = await collect(
    groupPeople(
      member(2),
      '<a href="/account/42"><div><button>nested-handle<span>affiliation</span><span>nickname</span></button></div></a>',
      1,
    ),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "42", jungolName: "nested-handle", tier: 0 },
  ]);
});

test("Given the current member-card account-id span When collecting members Then only its direct handle is retained", async () => {
  const members = await collect(
    groupPeople(
      member(2),
      '<a href="/account/42"><div><button>button-badge<span class="account-id">current-handle<span class="keep">tier-badge</span></span><span>nickname</span></button></div></a>',
      1,
    ),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
    { accountId: "42", jungolName: "current-handle", tier: 0 },
  ]);
});

test("Given empty or multiple current account-id spans When collecting members Then badge text is not accepted as a handle", async () => {
  for (const card of [
    '<a href="/account/42"><div><button>button-badge<span class="account-id"><span class="keep">tier-badge</span></span></button></div></a>',
    '<a href="/account/42"><div><button>button-badge<span class="account-id">first</span><span class="account-id">second</span></button></div></a>',
  ])
    await assert.rejects(collect(groupPeople(member(2), card, 1)), {
      code: "invalid_group_members",
    });
});

test("Given the official sprout-1 tier image When collecting members Then it maps to tier zero", async () => {
  const members = await collect(
    groupPeople(
      member(2),
      member(42, '<img src="https://s.jungol.co.kr/solved/sprout-1.svg">'),
      1,
    ),
  );
  assert.deepEqual(members, [
    { accountId: "2", jungolName: "member-2", tier: 0 },
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
    await assert.rejects(
      collect(groupPeople(member(2), member(42, image), 1)),
      {
        code: "invalid_group_members",
      },
    );
});

test("Given a delayed login notice When member readiness expires Then collection reports authentication is required", async () => {
  await assert.rejects(
    collect(
      `${groupPeople("", "", 0)}<script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<p>로그인이 필요해요</p>'), 500)</script>`,
    ),
    { code: "auth_required" },
  );
});
