import assert from "node:assert/strict";
import test from "node:test";
import {
  SubmissionIdExtractionError,
  submissionIdFromHrefs,
} from "../src/jungol/submission-id.js";

test("Given a submission link outside the timestamp cell When row links are read Then the validated sid is returned", () => {
  const id = submissionIdFromHrefs(
    ["/account/42", "?result=AC&sid=13829581"],
    "https://jungol.co.kr/group/1125/submission?result=AC",
  );

  assert.equal(id, "13829581");
});

test("Given repeated links with the same valid sid When row links are read Then extraction accepts the shared submission", () => {
  const id = submissionIdFromHrefs(
    [
      "/submission?sid=13829581",
      "/group/1125/submission?result=AC&sid=13829581",
      "?result=AC&sid=13829581",
    ],
    "https://jungol.co.kr/group/1125/submission?result=AC",
  );

  assert.equal(id, "13829581");
});

for (const [name, hrefs, code] of [
  ["missing", ["/account/42"], "submission_id_missing"],
  ["malformed", ["/submission?sid=zero"], "submission_id_malformed"],
  [
    "conflicting",
    ["/submission?sid=13829581", "/submission?sid=13829582"],
    "submission_id_conflicting",
  ],
  [
    "query-conflicting",
    ["/submission?sid=13829581&sid=13829582"],
    "submission_id_conflicting",
  ],
] as const) {
  test(`Given ${name} row submission IDs When row links are read Then extraction rejects the row`, () => {
    assert.throws(
      () => submissionIdFromHrefs(hrefs, "https://jungol.co.kr"),
      (error: unknown) =>
        error instanceof SubmissionIdExtractionError && error.code === code,
    );
  });
}
