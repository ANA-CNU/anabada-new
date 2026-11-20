import { expect, test } from "bun:test";
import { linkedSolvedProfile } from "../src/boj/solved-profile-browser.js";

const publicProfile = "https://solved.ac/ko/u/solved-alias";
const nativeProfile = "https://www.acmicpc.net/user/Ana";
const missingPage = {
  address: "https://solved.ac/ko/u/ana",
  status: 404,
  missingHeading: true,
  profileHeading: false,
  nativeLinks: [],
};

test("accepts a linked public profile independently of its solved problem count", () => {
  expect(
    linkedSolvedProfile("ana", {
      address: publicProfile,
      status: 200,
      missingHeading: false,
      profileHeading: true,
      nativeLinks: [nativeProfile],
    }),
  ).toEqual({ kind: "resolved", handle: "solved-alias" });
});

test("only a matching not-found page yields missing and blocked or unverified pages retry", () => {
  for (const status of [200, 404])
    expect(linkedSolvedProfile("ana", { ...missingPage, status })).toEqual({
      kind: "missing",
    });
  for (const status of [403, 429, 503])
    expect(linkedSolvedProfile("ana", { ...missingPage, status }).kind).toBe(
      "retry",
    );
  expect(
    linkedSolvedProfile("ana", { ...missingPage, missingHeading: false }).kind,
  ).toBe("retry");
  expect(
    linkedSolvedProfile("ana", { ...missingPage, address: publicProfile }).kind,
  ).toBe("retry");
  expect(
    linkedSolvedProfile("ana", {
      ...missingPage,
      status: 200,
      profileHeading: true,
      nativeLinks: ["https://acmicpc.net/user/someoneelse"],
    }).kind,
  ).toBe("retry");
  expect(
    linkedSolvedProfile("ana", {
      ...missingPage,
      address: "https://example.com/ko/u/ana",
      status: 200,
      profileHeading: true,
      nativeLinks: [nativeProfile],
    }).kind,
  ).toBe("retry");
});

test("a linked profile takes precedence over incidental not-found text", () => {
  expect(
    linkedSolvedProfile("ana", {
      ...missingPage,
      status: 200,
      profileHeading: true,
      nativeLinks: ["https://[", nativeProfile],
    }),
  ).toEqual({ kind: "resolved", handle: "ana" });
});
