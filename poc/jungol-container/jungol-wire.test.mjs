import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "bson";
import { decodeSubmissionPayload } from "./jungol-wire.mjs";

const FINGERPRINT = "00112233445566778899aabbccddeeff";

function encryptedPayload(value) {
  const bytes = serialize(value);
  const key = Buffer.from(FINGERPRINT, "hex");
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] ^= key[index % key.length];
  }
  return bytes;
}

test("decodes every raw attempt when the UI would group consecutive submissions", () => {
  // Given
  const body = encryptedPayload({
    data: {
      list: [
        {
          p: 1339,
          id: 13628739,
          r: "AC",
          s: 100,
          d: 207,
          m: 36572,
          u: "redacted",
          l: "JAVA",
          t: 1788608362887,
          c: null,
          i: false,
          b: 1257,
          a: "JAVA15",
        },
        {
          p: 1339,
          id: 13628731,
          r: "RE",
          s: 77.77777777777777,
          d: 232,
          m: 36780,
          u: "redacted",
          l: "JAVA",
          t: 1788608304276,
          c: null,
          i: false,
          b: 1133,
          a: "JAVA15",
        },
      ],
      paging: { type: "cursor", cursor: "next-cursor", more: true },
    },
  });

  // When
  const result = decodeSubmissionPayload(body, FINGERPRINT);

  // Then
  assert.deepEqual(
    result.attempts.map((attempt) => ({
      submissionId: attempt.submissionId,
      problemId: attempt.problemId,
      verdict: attempt.verdict,
      score: attempt.score,
      language: attempt.language,
    })),
    [
      {
        submissionId: "13628739",
        problemId: 1339,
        verdict: "accepted",
        score: 100,
        language: "JAVA15",
      },
      {
        submissionId: "13628731",
        problemId: 1339,
        verdict: "runtime_error",
        score: 77.77777777777777,
        language: "JAVA15",
      },
    ],
  );
  assert.deepEqual(result.paging, { cursor: "next-cursor", more: true });
});

test("rejects a missing fingerprint before parsing the payload", () => {
  // Given
  const body = Buffer.from([0]);

  // When / Then
  assert.throws(
    () => decodeSubmissionPayload(body, ""),
    /invalid_fingerprint/,
  );
});
