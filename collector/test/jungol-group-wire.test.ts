import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "bson";
import { rankMemberSchema } from "../src/domain/sync.js";
import {
  GroupActorResolver,
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

  assert.equal(new GroupActorResolver([member]).accountIdFor("member"), "42");
  assert.throws(
    () => new GroupActorResolver([member]).accountIdFor("missing"),
    { message: "group_actor_unresolved" },
  );
});
