import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "anabada-score-reason-links-"));
const componentBundle = join(temporaryDirectory, "ScoreReasonText.mjs");

try {
  await build({
    bundle: true,
    entryPoints: ["src/components/ScoreReasonText.tsx"],
    format: "esm",
    outfile: componentBundle,
    platform: "node",
  });
  const { ScoreReasonText } = await import(pathToFileURL(componentBundle).href);

  {
    // Given: 문제 번호가 없는 일반 점수 사유와 비어 있는 사유.
    const plainReason = "출석 보너스";
    // When: 점수 사유를 렌더링한다.
    const plainMarkup = renderToStaticMarkup(createElement(ScoreReasonText, { children: plainReason }));
    const emptyMarkup = renderToStaticMarkup(createElement(ScoreReasonText, { children: null }));
    // Then: 일반 텍스트는 보존하고 비어 있는 사유는 표시하지 않는다.
    assert.equal(plainMarkup, "<span>출석 보너스</span>");
    assert.equal(emptyMarkup, "");
  }

  {
    // Given: 앞뒤 텍스트와 반복된 문제 번호가 있는 점수 사유.
    const reason = "#12312을 해결하고 #42도 제출했습니다.";
    // When: 점수 사유를 렌더링한다.
    const markup = renderToStaticMarkup(createElement(ScoreReasonText, { children: reason }));
    // Then: 모든 문제 번호는 안전한 외부 링크가 되고 주변 텍스트는 유지된다.
    assert.match(markup, /^<span>/u);
    assert.match(markup, /href="https:\/\/jungol\.co\.kr\/problem\/12312"/u);
    assert.match(markup, /href="https:\/\/jungol\.co\.kr\/problem\/42"/u);
    assert.match(markup, /target="_blank"/u);
    assert.match(markup, /rel="noopener noreferrer"/u);
    assert.match(markup, />#12312<\/a>을 해결하고 <a[^>]*>#42<\/a>도 제출했습니다\.<\/span>$/u);
  }

  {
    // Given: 같은 문제 번호가 반복되는 점수 사유.
    const reason = "#12312 재채점 #12312";
    // When: 점수 사유를 렌더링한다.
    const markup = renderToStaticMarkup(createElement(ScoreReasonText, { children: reason }));
    // Then: 반복된 번호도 각각 독립적인 링크로 렌더링된다.
    assert.equal((markup.match(/href="https:\/\/jungol\.co\.kr\/problem\/12312"/gu) ?? []).length, 2);
  }

  {
    // Given: 마크업처럼 보이는 문자와 문제 번호가 섞인 점수 사유.
    const reason = "<img src=x> #7";
    // When: 점수 사유를 렌더링한다.
    const markup = renderToStaticMarkup(createElement(ScoreReasonText, { children: reason }));
    // Then: 일반 텍스트는 React가 이스케이프하고 숫자 참조만 링크가 된다.
    assert.match(markup, /&lt;img src=x&gt; /u);
    assert.doesNotMatch(markup, /<img src=x>/u);
    assert.match(markup, /href="https:\/\/jungol\.co\.kr\/problem\/7"/u);
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
