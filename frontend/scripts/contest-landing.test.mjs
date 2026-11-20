import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const temporaryDirectory = await mkdtemp(join(process.cwd(), ".contest-landing-test-"));
const componentBundle = join(temporaryDirectory, "ContestLanding.mjs");
const countdownBundle = join(temporaryDirectory, "contest-countdown.mjs");

try {
  await build({
    bundle: true,
    entryPoints: ["src/home/components/ContestLanding.tsx"],
    format: "esm",
    jsx: "automatic",
    outfile: componentBundle,
    packages: "external",
    platform: "node",
  });
  const { default: ContestLanding } = await import(pathToFileURL(componentBundle).href);
  await build({
    bundle: true,
    entryPoints: ["src/home/components/contest-countdown.ts"],
    format: "esm",
    outfile: countdownBundle,
    platform: "node",
  });
  const { CONTEST_START_TIME, getContestCountdown } = await import(pathToFileURL(countdownBundle).href);

  {
    // Given: KST 절대 시각을 기준으로 한 대회 시작 직전, 시작 시각, 여러 일 뒤 시각과 시작 이후 시각.
    // When: 남은 시간을 계산한다.
    const oneSecondBefore = getContestCountdown(new Date("2026-10-05T03:59:59.100Z"));
    const atStart = getContestCountdown(new Date("2026-10-05T04:00:00.000Z"));
    const multipleDaysBefore = getContestCountdown(new Date("2026-10-02T10:29:58.200Z"));
    const afterStart = getContestCountdown(new Date("2026-10-05T04:00:01.000Z"));
    // Then: 환경 시간대와 무관하게 올림 초 단위로 계산하고, 시작 시각부터는 0으로 고정한다.
    assert.equal(CONTEST_START_TIME, "2026-10-05T13:00:00+09:00");
    assert.deepEqual(oneSecondBefore, { days: 0, hours: 0, minutes: 0, seconds: 1 });
    assert.deepEqual(atStart, { days: 0, hours: 0, minutes: 0, seconds: 0 });
    assert.deepEqual(multipleDaysBefore, { days: 2, hours: 17, minutes: 30, seconds: 2 });
    assert.deepEqual(afterStart, { days: 0, hours: 0, minutes: 0, seconds: 0 });
  }

  {
    const markup = renderToStaticMarkup(createElement(ContestLanding));
    assert.match(markup, /aria-labelledby="contest-landing-title"/u);
    assert.match(markup, /2026 SW-IT Contest가 종료되었습니다/u);
    assert.doesNotMatch(markup, /role="timer"/u);
    assert.match(markup, /href="https:\/\/aoj\.anacnu\.kr\/sources\/408"/u);
    assert.match(markup, /href="\/swit-2026-editorial\.pdf"/u);
    assert.equal((markup.match(/target="_blank"/gu) ?? []).length, 2);
    assert.equal((markup.match(/rel="noopener noreferrer"/gu) ?? []).length, 2);
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
