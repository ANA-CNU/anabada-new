import assert from "node:assert/strict";
import { test } from "node:test";
import { rejectJungolHttpStatus } from "../src/jungol/errors.js";
import { JungolRequestCoordinator } from "../src/jungol/request-coordinator.js";

type Deferred = {
  readonly promise: Promise<void>;
  resolve(): void;
};

type RoutedRequest = {
  readonly url: string;
  readonly type: string;
};

const deferred = (): Deferred => {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: () => resolve?.() };
};

test("Given queued operations When each settles Then they run FIFO with a 3000ms post-settlement gap", async () => {
  const delays: number[] = [];
  const coordinator = new JungolRequestCoordinator({
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  const first = deferred();
  const events: string[] = [];

  const one = coordinator.schedule("rank_page", undefined, async () => {
    events.push("first:start");
    await first.promise;
    events.push("first:end");
  });
  const two = coordinator.schedule("submission_page", undefined, async () => {
    events.push("second:start");
  });
  const three = coordinator.schedule(
    "problem_metadata",
    undefined,
    async () => {
      events.push("third:start");
    },
  );

  assert.deepEqual(events, ["first:start"]);
  first.resolve();
  await Promise.all([one, two, three]);
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "third:start",
  ]);
  assert.deepEqual(delays, [3000, 3000]);
});

test("Given an empty queue during cooldown When a later operation arrives Then it waits for the prior 3000ms gap", async () => {
  const cooldown = deferred();
  const coordinator = new JungolRequestCoordinator({
    delay: async (milliseconds) => {
      assert.equal(milliseconds, 3000);
      await cooldown.promise;
    },
  });
  const events: string[] = [];

  await coordinator.schedule("rank_page", undefined, async () => {
    events.push("first");
  });
  const later = coordinator.schedule("submission_page", undefined, async () => {
    events.push("later");
  });

  assert.deepEqual(events, ["first"]);
  cooldown.resolve();
  await later;
  assert.deepEqual(events, ["first", "later"]);
});

test("Given a configured browser context When a resource is Jungol media Then it is blocked without blocking allowed requests", async () => {
  let handler:
    | ((route: {
        request(): { url(): string; resourceType(): string };
        abort(): Promise<void>;
        continue(): Promise<void>;
      }) => Promise<void>)
    | undefined;
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  await coordinator.configureContext(
    {
      route: async (_pattern, registered) => {
        handler = registered;
      },
    },
    "https://jungol.co.kr",
  );
  const registered = handler;
  assert.ok(registered);

  const dispatch = async (request: RoutedRequest): Promise<string> => {
    let action = "";
    await registered({
      request: () => ({
        url: () => request.url,
        resourceType: () => request.type,
      }),
      abort: async () => {
        action = "abort";
      },
      continue: async () => {
        action = "continue";
      },
    });
    return action;
  };

  assert.equal(
    await dispatch({ url: "https://jungol.co.kr/a", type: "image" }),
    "abort",
  );
  assert.equal(
    await dispatch({ url: "https://jungol.co.kr/a", type: "font" }),
    "abort",
  );
  assert.equal(
    await dispatch({ url: "https://jungol.co.kr/a", type: "media" }),
    "abort",
  );
  for (const type of ["document", "stylesheet", "script", "xhr", "fetch"]) {
    assert.equal(
      await dispatch({ url: "https://jungol.co.kr/a", type }),
      "continue",
    );
  }
  assert.equal(
    await dispatch({ url: "https://outside.test/a", type: "image" }),
    "continue",
  );
});

test("Given rank or metadata receives 403 or 429 When checking the Jungol response Then it fails closed", () => {
  for (const status of [403, 429]) {
    assert.throws(() => rejectJungolHttpStatus(status), {
      code: "jungol_http_rejected",
    });
  }
  assert.doesNotThrow(() => rejectJungolHttpStatus(404));
});

test("Given a failed operation When a later operation is queued Then the later operation still runs", async () => {
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  const failure = coordinator.schedule("rank_page", undefined, async () => {
    throw new Error("expected");
  });
  let succeeded = false;
  const recovery = coordinator.schedule(
    "submission_page",
    undefined,
    async () => {
      succeeded = true;
    },
  );
  await assert.rejects(failure);
  await recovery;
  assert.equal(succeeded, true);
});

test("Given an aborted queued operation When its turn arrives Then its callback is never invoked", async () => {
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  const first = deferred();
  const controller = new AbortController();
  const running = coordinator.schedule(
    "rank_page",
    undefined,
    () => first.promise,
  );
  let invoked = false;
  const queued = coordinator.schedule(
    "submission_page",
    controller.signal,
    async () => {
      invoked = true;
    },
  );
  controller.abort();
  first.resolve();
  await running;
  await assert.rejects(queued, { code: "cancelled" });
  assert.equal(invoked, false);
});

test("Given a closed coordinator When jobs are queued or newly submitted Then they reject without running", async () => {
  const coordinator = new JungolRequestCoordinator({ delay: async () => {} });
  const first = deferred();
  const running = coordinator.schedule(
    "rank_page",
    undefined,
    () => first.promise,
  );
  let queuedInvoked = false;
  const queued = coordinator.schedule(
    "submission_page",
    undefined,
    async () => {
      queuedInvoked = true;
    },
  );
  coordinator.close();
  first.resolve();
  await running;
  await assert.rejects(queued, { code: "closed" });
  await assert.rejects(
    coordinator.schedule("problem_metadata", undefined, async () => {}),
    { code: "closed" },
  );
  assert.equal(queuedInvoked, false);
});
