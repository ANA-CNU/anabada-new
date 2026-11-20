import assert from "node:assert/strict";
import test from "node:test";
import { loadActiveEventCount, loadAdminUsers } from "../src/admin/dashboard-api.ts";

const baseUrl = "http://admin.test";
const signal = new AbortController().signal;

test("requests the admin user list with credentials and keeps an empty list", async () => {
  const users = await loadAdminUsers(baseUrl, signal, async (url, options) => {
    assert.equal(url, `${baseUrl}/api/users/all`);
    assert.deepEqual(options, { credentials: "include", signal });
    return Response.json({ success: true, data: [] });
  });
  assert.deepEqual(users, []);
});

test("uses the active event count across all pages, including zero", async () => {
  for (const total of [12, 0]) {
    const count = await loadActiveEventCount(baseUrl, signal, async (url, options) => {
      assert.equal(url, `${baseUrl}/api/events?status=active&limit=1`);
      assert.deepEqual(options, { credentials: "include", signal });
      return Response.json({ success: true, data: total ? [{ id: 1 }] : [], pagination: { total } });
    });
    assert.equal(count, total);
  }
});

test("rejects an auth error, an unsuccessful response, and invalid response data", async () => {
  await assert.rejects(loadAdminUsers(baseUrl, signal, async () => new Response(null, { status: 401 })), /401/u);
  await assert.rejects(loadAdminUsers(baseUrl, signal, async () => Response.json({ success: false })), /요청 실패/u);
  await assert.rejects(loadAdminUsers(baseUrl, signal, async () => Response.json({ success: true, data: null })), /유저 목록/u);
  for (const total of [undefined, -1, 1.5, "12"]) {
    await assert.rejects(loadActiveEventCount(baseUrl, signal, async () => Response.json({ success: true, pagination: { total } })), /이벤트 개수/u);
  }
});
