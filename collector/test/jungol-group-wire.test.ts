import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "bson";
import { rankMemberSchema } from "../src/domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../src/domain.js";
import {
  GroupActorResolver,
  GroupActorUnresolvedError,
  GroupWireDecoder,
} from "../src/jungol/group-wire.js";

const encrypted = (value: Parameters<typeof serialize>[0]): Uint8Array =>
  serialize(value).map((byte) => byte ^ 0xaa);

const row = (id: number, actor = "member") => ({
  p: 1000,
  id,
  r: "AC",
  s: 100,
  d: 0,
  m: 0,
  u: actor,
  l: "",
  t: 1_700_000_000_000,
  c: null,
  i: false,
  b: 0,
  a: "JAVA",
});

test("Given a verified group BSON page When decoding Then actor handles and opaque paging survive", () => {
  const page = new GroupWireDecoder().decode(
    encrypted({
      data: {
        list: [row(20)],
        paging: { type: "next", cursor: "opaque", more: true },
      },
    }),
    "aa",
  );

  assert.deepEqual(
    page.entries.map((entry) => entry.actorHandle),
    ["member"],
  );
  assert.equal(page.entries[0]?.submissionId, "20");
  assert.deepEqual(page.paging, { cursor: "opaque", more: true });
});

for (const cursor of [undefined, null, ""] as const) {
  test("Given a terminal empty group page When its cursor is absent Then decoding normalizes it to null", () => {
    // Given
    const paging = {
      type: "next",
      more: false,
      ...(cursor === undefined ? {} : { cursor }),
    };

    // When
    const page = new GroupWireDecoder().decode(
      encrypted({ data: { list: [], paging } }),
      "aa",
    );

    // Then
    assert.deepEqual(page.paging, { cursor: null, more: false });
  });
}

test("Given a continuing group page When its cursor is absent Then decoding rejects the envelope", () => {
  // Given / When / Then
  assert.throws(
    () =>
      new GroupWireDecoder().decode(
        encrypted({
          data: { list: [], paging: { type: "next", more: true } },
        }),
        "aa",
      ),
    { code: "invalid_envelope" },
  );
});

test("Given an actor handle matching one rank member When resolving Then the verified account ID is returned", () => {
  const member = rankMemberSchema.parse({
    accountId: "42",
    jungolName: "member",
    solvedCount: 0,
    wrongCount: 0,
    acRating: 0,
    tier: 0,
  });

  const resolver = new GroupActorResolver([member]);
  const entry = {
    submissionId: submissionIdSchema.parse("20"),
    problemId: problemIdSchema.parse(1000),
  };
  assert.equal(resolver.accountIdFor("member", entry, 2), "42");
  assert.throws(
    () => resolver.accountIdFor("missing\n`", entry, 2),
    (error: unknown) => {
      assert.equal(error instanceof GroupActorUnresolvedError, true);
      assert.deepEqual((error as GroupActorUnresolvedError).diagnostics, {
        stage: "actor",
        submissionId: "20",
        problemId: "1000",
        actorHandle: "missing  ",
        memberCount: 1,
        responseCount: 2,
        matchedCount: 1,
      });
      return true;
    },
  );
});
