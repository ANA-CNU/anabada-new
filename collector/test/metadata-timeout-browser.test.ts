import assert from "node:assert/strict";
import { problemIdSchema } from "../src/domain.js";
import { JungolError } from "../src/jungol/errors.js";
import { ProblemMetadataResolver } from "../src/jungol/metadata.js";
import {
  asyncBrowserFixture,
  FetchGate,
  browserTest as test,
  tracked,
} from "./async-browser-fixture.js";

test("HTTP failure is not cached as a missing tier", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    "",
    new Map([["/problem/5498", gate]]),
  );
  const pending = tracked(
    new ProblemMetadataResolver(settings, requests).resolve(
      page,
      problemIdSchema.parse(5498),
    ),
  );
  await gate.requested;
  gate.release("Unavailable", 503);
  const result = await pending.result;
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error instanceof JungolError);
  assert.equal(result.error.code, "problem_metadata_http_failed");
  assert.equal(result.error.diagnostics?.httpStatus, 503);
});

test("navigation timeout reports its problem and does not return an estimated tier", async (t) => {
  const gate = new FetchGate();
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    "",
    new Map([["/problem/5498", gate]]),
  );
  await assert.rejects(
    new ProblemMetadataResolver(
      { ...settings, pageTimeoutMs: 100 },
      requests,
    ).resolve(page, problemIdSchema.parse(5498)),
    (error: unknown) => {
      assert.ok(error instanceof JungolError);
      assert.equal(error.code, "problem_metadata_timeout");
      assert.equal(error.diagnostics?.stage, "problem_metadata_navigation");
      assert.equal(error.diagnostics?.problemId, 5498);
      return true;
    },
  );
});

test("an observed but unreadable tier image is not an unrated problem", async (t) => {
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    '<h1><img src="https://s.jungol.co.kr/solved/loading.svg"><span>Problem</span></h1><article><section><h2>문제</h2><p>본문</p></section></article>',
    new Map(),
  );
  await assert.rejects(
    new ProblemMetadataResolver(
      { ...settings, pageTimeoutMs: 100 },
      requests,
    ).resolve(page, problemIdSchema.parse(5498)),
    { code: "problem_metadata_timeout" },
  );
});

test("loaded problem statement without a tier image is a normal unknown tier", async (t) => {
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    "<h1><span>Unrated problem</span></h1><article><section><h2>문제</h2><p>완전히 로딩된 문제 본문</p></section></article>",
    new Map(),
  );
  const result = await new ProblemMetadataResolver(
    { ...settings, pageTimeoutMs: 100 },
    requests,
  ).resolve(page, problemIdSchema.parse(5498));
  assert.deepEqual(result, {
    problemId: 5498,
    title: "Unrated problem",
    tier: 0,
  });
});

test("tier image filename takes precedence over an unrelated data-tier attribute", async (t) => {
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    '<span data-tier="0"></span><h1><img src="https://s.jungol.co.kr/solved/7.svg?dm=jungol.co.kr"><span>Known problem</span></h1>',
    new Map(),
  );
  const result = await new ProblemMetadataResolver(settings, requests).resolve(
    page,
    problemIdSchema.parse(5498),
  );
  assert.equal(result.tier, 7);
});

test("observed tier image with missing title reports precise timeout evidence and is not cached", async (t) => {
  const pages = new Map([
    [
      "/problem/5498",
      '<h1><img src="https://s.jungol.co.kr/solved/7.svg"></h1>',
    ],
  ]);
  const { page, settings, requests } = await asyncBrowserFixture(
    t,
    pages,
    new Map(),
  );
  const resolver = new ProblemMetadataResolver(
    { ...settings, pageTimeoutMs: 100 },
    requests,
  );
  await assert.rejects(
    resolver.resolve(page, problemIdSchema.parse(5498)),
    (error: unknown) => {
      assert.ok(error instanceof JungolError);
      assert.equal(error.code, "problem_metadata_timeout");
      assert.equal(error.diagnostics?.problemId, 5498);
      assert.equal(error.diagnostics?.imageObserved, true);
      assert.equal(error.diagnostics?.titleObserved, false);
      assert.equal(error.diagnostics?.timeoutMs, 100);
      return true;
    },
  );
  pages.set(
    "/problem/5498",
    '<h1><img src="https://s.jungol.co.kr/solved/7.svg"><span>Recovered</span></h1>',
  );
  assert.equal(
    (await resolver.resolve(page, problemIdSchema.parse(5498))).tier,
    7,
  );
});
