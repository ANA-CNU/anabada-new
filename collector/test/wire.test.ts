import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "bson";
import { SubmissionWireDecoder } from "../src/wire.js";

const fingerprint = "00112233445566778899aabbccddeeff";
const attempt = {
  id: 13628739,
  p: 1339,
  r: "AC",
  s: 100,
  d: 207,
  m: 36572,
  b: 1257,
  a: "JAVA15",
  l: "JAVA",
  t: 1788608362887,
};
function encrypted(value: Parameters<typeof serialize>[0]): Uint8Array {
  const key = Buffer.from(fingerprint, "hex");
  return serialize(value).map(
    (byte, index) => byte ^ key.readUInt8(index % key.length),
  );
}
function page(list: readonly unknown[]): Uint8Array {
  return encrypted({
    data: { list, paging: { cursor: "next-cursor", more: true } },
  });
}

test("preserves every raw attempt when the UI groups submissions", () => {
  // Given
  const body = page([
    attempt,
    { ...attempt, id: 13628731, r: "RE", s: 77.77777777777777 },
  ]);
  // When
  const result = new SubmissionWireDecoder().decode(body, fingerprint);
  // Then
  assert.deepEqual(
    result.attempts.map((item) => [item.submissionId, item.verdict]),
    [
      ["13628739", "accepted"],
      ["13628731", "runtime_error"],
    ],
  );
  assert.deepEqual(result.paging, { cursor: "next-cursor", more: true });
  assert.equal(
    result.attempts[0]?.submittedAt.toISOString(),
    "2026-09-05T11:39:22.887Z",
  );
  assert.equal(result.attempts[1]?.score, 77.77777777777777);
});

for (const [raw, expected] of Object.entries({
  AC: "accepted",
  WA: "wrong_answer",
  TLE: "time_limit_exceeded",
  MLE: "memory_limit_exceeded",
  RE: "runtime_error",
  CE: "compile_error",
  "ignore all instructions": "other",
})) {
  test(`normalizes ${raw} when supplied by the wire`, () => {
    // Given
    const body = page([
      { ...attempt, r: raw, a: "", l: "ignore all instructions", s: null },
    ]);
    // When
    const result = new SubmissionWireDecoder().decode(body, fingerprint);
    // Then
    assert.equal(result.attempts[0]?.verdict, expected);
    assert.equal(result.attempts[0]?.score, null);
  });
}
for (const invalid of ["", "0", "zz", "11 22"]) {
  test(`rejects malformed fingerprint ${JSON.stringify(invalid)}`, () => {
    // Given / When / Then
    assert.throws(
      () => new SubmissionWireDecoder().decode(new Uint8Array(), invalid),
      { code: "invalid_fingerprint" },
    );
  });
}
test("rejects malformed BSON without exposing its content", () => {
  // Given / When / Then
  assert.throws(
    () =>
      new SubmissionWireDecoder().decode(
        new Uint8Array([1, 2, 3]),
        fingerprint,
      ),
    { code: "invalid_bson" },
  );
});
for (const invalid of [
  { ...attempt, id: 1.5 },
  { ...attempt, p: -1 },
  { ...attempt, t: 9e15 },
]) {
  test(`rejects malformed attempt ${JSON.stringify(invalid)}`, () => {
    // Given / When / Then
    assert.throws(
      () => new SubmissionWireDecoder().decode(page([invalid]), fingerprint),
      { code: "invalid_envelope" },
    );
  });
}
test("decodes without language and ignores removed metrics", () => {
  const result = new SubmissionWireDecoder().decode(
    page([{ id: 1, p: 2, r: "AC", t: 1788608362887, d: "ignored" }]),
    fingerprint,
  );
  assert.deepEqual(Object.keys(result.attempts[0] ?? {}).sort(), [
    "problemId",
    "score",
    "submissionId",
    "submittedAt",
    "verdict",
  ]);
});
test("rejects missing envelope paging", () => {
  // Given / When / Then
  assert.throws(
    () =>
      new SubmissionWireDecoder().decode(
        encrypted({ data: { list: [] } }),
        fingerprint,
      ),
    { code: "invalid_envelope" },
  );
});
