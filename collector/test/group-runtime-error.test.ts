import assert from "node:assert/strict";
import test from "node:test";
import { GroupRuntimeErrorPolicy } from "../src/application/group-runtime-error.js";
import { BoundaryError } from "../src/errors.js";

test("Given a boundary actor-resolution error When reporting a runtime failure Then its approved code is preserved", () => {
  assert.equal(
    new GroupRuntimeErrorPolicy().code(
      new BoundaryError("group_actor_unresolved"),
    ),
    "group_actor_unresolved",
  );
});
