import assert from "node:assert/strict";
import test from "node:test";
import { sourceLocationFrom } from "../src/application/safe-source-location.js";

test("Given a source-mapped collector frame When extracting an alert location Then it returns only a repository-relative frame", () => {
  // Given
  const error = new Error("private message");
  error.stack = [
    "Error: private message",
    "    at loadNextPage (file:///Users/example/anabada/collector/src/jungol/group-feed.ts:211:9)",
    "    at private (https://example.test/path?token=secret:1:2)",
  ].join("\n");

  // When
  const location = sourceLocationFrom(error, "GroupFeedCollector.loadNextPage");

  // Then
  assert.deepEqual(location, {
    method: "GroupFeedCollector.loadNextPage",
    source: "collector/src/jungol/group-feed.ts",
    line: 211,
  });
});

test("Given a non-collector stack When extracting an alert location Then it withholds the frame", () => {
  // Given
  const error = new Error("secret");
  error.stack =
    "Error: secret\n    at private (https://example.test/path?token=secret:1:2)";

  // When
  const location = sourceLocationFrom(error, "GroupFeedCollector.loadNextPage");

  // Then
  assert.equal(location, undefined);
});

test("Given an error message that resembles a frame When extracting an alert location Then it never treats the message as a source frame", () => {
  // Given
  const error = new Error("at fake (/private/collector/src/private.ts:9:1)");
  error.stack = [
    "Error: at fake (/private/collector/src/private.ts:9:1)",
    "    at private (https://example.test/path?token=secret:1:2)",
  ].join("\n");

  // When
  const location = sourceLocationFrom(error, "GroupFeedCollector.loadNextPage");

  // Then
  assert.equal(location, undefined);
});
