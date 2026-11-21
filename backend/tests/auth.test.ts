import { expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { AdminAuthenticator } from "../src/auth.js";
import { createApplication } from "../src/index.js";
import { DatabasePool } from "../src/infrastructure/mysql/database-session.js";

const secret = "auth-test-key-with-at-least-32-characters";
const origin = "http://localhost:20030";
function token(extra: Record<string, unknown> = {}) {
  return jwt.sign({ solvedAcId: "871", ...extra }, secret, {
    algorithm: "HS256",
    subject: "41",
    issuer: "anabada",
    audience: "anabada-web",
    expiresIn: 3600,
  });
}
function request(value = token(), method = "GET", requestOrigin = origin) {
  return new Request(`${origin}/api/users/all`, {
    method,
    headers: {
      cookie: `anabada_session=${encodeURIComponent(value)}`,
      origin: requestOrigin,
    },
  });
}

test("grants admin when a signed identity is currently listed in the database", async () => {
  // Given a database authorizer recognizing the complete stable identity.
  const auth = new AdminAuthenticator(
    secret,
    async (userId, solvedAcId) => userId === 41 && solvedAcId === "871",
    origin,
  );
  // When verifying the cookie.
  const result = await auth.isAdmin(request());
  // Then access is granted.
  expect(result).toBe(true);
});

test("denies admin when a signed role claim has no current database grant", async () => {
  // Given a valid JWT with a forged privilege claim but no DB grant.
  const auth = new AdminAuthenticator(secret, async () => false, origin);
  // When authorizing.
  const result = await auth.isAdmin(request(token({ role: "admin" })));
  // Then role cannot grant authority.
  expect(result).toBe(false);
});

test("rejects the obsolete accessToken cookie when it contains an admin role", async () => {
  // Given the old middleware's role-only cookie.
  const auth = new AdminAuthenticator(secret, async () => true, origin);
  const oldRequest = new Request(`${origin}/api/users/all`, {
    headers: {
      cookie: `accessToken=${encodeURIComponent(`Bearer ${jwt.sign({ role: "admin" }, secret)}`)}`,
    },
  });
  // When authorizing.
  const result = await auth.isAdmin(oldRequest);
  // Then the old trust path is disabled.
  expect(result).toBe(false);
});

test("denies writes when a different origin sends a valid admin cookie", async () => {
  // Given an administrator and an attacker's Origin.
  const auth = new AdminAuthenticator(secret, async () => true, origin);
  // When authorizing a mutation.
  const result = await auth.isAdmin(
    request(token(), "POST", "https://attacker.invalid"),
  );
  // Then the mutation is denied.
  expect(result).toBe(false);
});

test("denies malformed cookies without throwing when percent encoding is invalid", async () => {
  // Given malformed input.
  const auth = new AdminAuthenticator(secret, async () => true, origin);
  const badRequest = new Request(`${origin}/api/users/all`, {
    headers: { cookie: "anabada_session=%E0%A4%A" },
  });
  // When authorization parses it.
  const result = await auth.isAdmin(badRequest);
  // Then the invalid cookie fails closed.
  expect(result).toBe(false);
});

test("denies every admin route when an asynchronous authorization resolves false", async () => {
  // Given a full Elysia application and delayed denial; no SQL should be opened.
  let connections = 0;
  const app = createApplication({
    databasePool: new DatabasePool({
      getConnection: async () => {
        connections++;
        throw new Error("unauthorized SQL access");
      },
    }),
    authorizer: { isAdmin: async () => false },
    incidentReporter: { report: async () => "disabled" },
    config: { NODE_ENV: "test", ALLOWED_ORIGIN: origin },
  });
  const routes = [
    ["GET", "/api/users/all"],
    ["PUT", "/api/users/41"],
    ["DELETE", "/api/users/41"],
    ["GET", "/api/hooks"],
    ["GET", "/api/hooks/1"],
    ["POST", "/api/hooks"],
    ["PUT", "/api/hooks/1"],
    ["DELETE", "/api/hooks/1"],
    ["PATCH", "/api/hooks/1/toggle"],
    ["POST", "/api/event/create"],
    ["PUT", "/api/events/1"],
    ["DELETE", "/api/events/1"],
    ["POST", "/api/score-history/bulk"],
    ["GET", "/api/admin/score-history"],
    ["PUT", "/api/score-history/1"],
    ["DELETE", "/api/score-history/1"],
    ["POST", "/api/bias/date-init"],
    ["GET", "/api/bias/all"],
    ["GET", "/api/admin/ranking-boards"],
    ["GET", "/api/admin/ranking-boards/1"],
    ["PATCH", "/api/admin/ranking-boards/1/active"],
  ] as const;
  // When each protected route is called over the real HTTP surface.
  const responses = await Promise.all(
    routes.map(([method, path]) =>
      app.handle(new Request(`${origin}${path}`, { method })),
    ),
  );
  // Then every route rejects before accessing data.
  expect(responses.map((response) => response.status)).toEqual(
    routes.map(() => 401),
  );
  expect(connections).toBe(0);
});
