import { expect, test } from "bun:test";
import { CollectorConfigLoader } from "../../../collector/src/config.js";
import { HookRepository } from "../../../collector/src/mysql/hooks.js";
import { CollectorPoolFactory } from "../../../collector/src/mysql/pool.js";
import { createMysqlTestContext } from "../mysql/context.js";

const request = (method: string, path: string, body?: object): Request =>
  new Request(`http://test${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

test("Given an administrator webhook registration When its state changes through the API Then the collector sees only active shared-table endpoints", async () => {
  const context = await createMysqlTestContext();
  let collectorPool: ReturnType<CollectorPoolFactory["create"]> | undefined;
  try {
    const collectorConfig = new CollectorConfigLoader().parse({
      DB_PASSWORD: process.env.DB_PASSWORD,
      JUNGOL_USERNAME: "webhook-registration-test",
      JUNGOL_PASSWORD: "webhook-registration-test",
      WEBHOOK_URL: "",
    });
    collectorPool = new CollectorPoolFactory().create(
      collectorConfig,
      collectorConfig.credentials,
    );
    await context.seed();
    const collectorHooks = new HookRepository(collectorPool);

    const created = await context.handle(
      request("POST", "/api/hooks", { url: "https://example.test/admin-hook" }),
    );
    expect(created.status).toBe(200);
    const { hook_id: hookId } = await created.json();
    expect(typeof hookId).toBe("number");
    if (typeof hookId !== "number") throw new Error("missing hook id");

    expect(await collectorHooks.readActive()).toContainEqual({
      id: hookId,
      url: "https://example.test/admin-hook",
    });

    const updated = await context.handle(
      request("PUT", `/api/hooks/${hookId}`, {
        url: "https://example.test/updated-admin-hook",
        ignored: false,
      }),
    );
    expect(updated.status).toBe(200);
    expect(await collectorHooks.readActive()).toContainEqual({
      id: hookId,
      url: "https://example.test/updated-admin-hook",
    });

    const toggled = await context.handle(
      request("PATCH", `/api/hooks/${hookId}/toggle`),
    );
    expect(toggled.status).toBe(200);
    expect(await collectorHooks.readActive()).not.toContainEqual({
      id: hookId,
      url: "https://example.test/updated-admin-hook",
    });

    const reactivated = await context.handle(
      request("PATCH", `/api/hooks/${hookId}/toggle`),
    );
    expect(reactivated.status).toBe(200);
    expect(await collectorHooks.readActive()).toContainEqual({
      id: hookId,
      url: "https://example.test/updated-admin-hook",
    });

    const deleted = await context.handle(
      request("DELETE", `/api/hooks/${hookId}`),
    );
    expect(deleted.status).toBe(200);
    expect(
      (await context.handle(request("GET", `/api/hooks/${hookId}`))).status,
    ).toBe(404);
  } finally {
    try {
      await collectorPool?.end();
    } finally {
      await context.close();
    }
  }
});
