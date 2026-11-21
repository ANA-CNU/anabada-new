import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { NextRequest } from "next/server";
import { exchangeIdentity, ProviderIdentityError } from "./provider";

mock.module("server-only", () => ({}));
const { signOAuthState, signSession, verifyOAuthState, verifySession } =
	await import("./tokens");
const { handleCallback, logout, startLogin } = await import("./handlers");
const secret = "auth-test-key-with-at-least-32-characters";
const key = new TextEncoder().encode(secret);
const config = {
	clientId: "app-id",
	clientSecret: "app-secret",
	redirectUri: "http://localhost:20030/auth/solved-ac/callback",
};
const state = "s".repeat(43);
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
let expectedChallenge = challenge;
const previous = {
	JWT_SECRET: process.env.JWT_SECRET,
	APP_ORIGIN: process.env.APP_ORIGIN,
	SOLVED_AC_CLIENT_ID: process.env.SOLVED_AC_CLIENT_ID,
	SOLVED_AC_CLIENT_SECRET: process.env.SOLVED_AC_CLIENT_SECRET,
};
let profileId = 871;
let verified = true;
let tokenCalls = 0;
const provider = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		if (
			request.headers.get("x-client-id") !== config.clientId ||
			request.headers.get("x-client-secret") !== config.clientSecret
		)
			return new Response(null, { status: 401 });
		const path = new URL(request.url).pathname;
		if (path === "/api/v4/oauth/token") {
			tokenCalls++;
			const body = new URLSearchParams(await request.text());
			if (
				request.method !== "POST" ||
				body.get("grant_type") !== "authorization_code" ||
				body.get("code") !== "provider-code" ||
				body.get("redirect_uri") !== config.redirectUri ||
				createHash("sha256")
					.update(body.get("code_verifier") ?? "")
					.digest("base64url") !== expectedChallenge
			)
				return new Response(null, { status: 400 });
			return Response.json({
				access_token: "server-only-provider-token",
				token_type: "Bearer",
				expires_in: 3600,
				scope: "profile",
			});
		}
		if (
			request.headers.get("authorization") !==
			"Bearer server-only-provider-token"
		)
			return new Response(null, { status: 401 });
		if (path === "/api/v4/me")
			return Response.json({ id: 871, handle: "renamable" });
		if (path === "/api/v4/users/renamable")
			return Response.json({
				id: profileId,
				handle: "renamable",
				ojAccounts: [{ ojId: "boj", handle: "existing-boj", verified }],
			});
		return new Response(null, { status: 404 });
	},
});
beforeAll(() => {
	Object.assign(process.env, {
		JWT_SECRET: secret,
		APP_ORIGIN: "http://localhost:20030",
		SOLVED_AC_CLIENT_ID: config.clientId,
		SOLVED_AC_CLIENT_SECRET: config.clientSecret,
	});
});
afterAll(() => {
	provider.stop(true);
	for (const [name, value] of Object.entries(previous)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

async function callback(receivedState = state) {
	return new NextRequest(
		`${config.redirectUri}?code=provider-code&state=${receivedState}`,
		{
			headers: {
				cookie: `anabada_oauth=${await signOAuthState(state, verifier, key)}`,
			},
		},
	);
}
const providerExchange: typeof exchangeIdentity = (
	settings,
	code,
	codeVerifier,
) => exchangeIdentity(settings, code, codeVerifier, provider.url.origin);

test("creates a PKCE authorization redirect and HttpOnly state when login begins", async () => {
	// Given configured credentials.
	// When the login route starts.
	const response = await startLogin();
	// Then the browser receives PKCE and a protected state cookie.
	const target = new URL(response.headers.get("location") ?? "");
	expect(target.origin + target.pathname).toBe(
		"https://solved.ac/oauth/authorize",
	);
	expect(target.searchParams.get("code_challenge_method")).toBe("S256");
	expect(target.searchParams.get("scope")).toBe("profile");
	expect(response.cookies.get("anabada_oauth")?.httpOnly).toBe(true);
	expect(response.cookies.get("anabada_oauth")?.maxAge).toBe(600);
	expect(response.headers.get("location")).not.toContain(config.clientSecret);
});

test("issues a seven-day local session when trusted OAuth identifies an existing member", async () => {
	// Given a real login redirect and its cookie plus an existing member.
	const login = await startLogin();
	const authorization = new URL(login.headers.get("location") ?? "");
	expectedChallenge = authorization.searchParams.get("code_challenge") ?? "";
	const request = new NextRequest(
		`${config.redirectUri}?code=provider-code&state=${authorization.searchParams.get("state")}`,
		{
			headers: {
				cookie: `anabada_oauth=${login.cookies.get("anabada_oauth")?.value}`,
			},
		},
	);
	// When the callback completes over HTTP with the fake provider.
	const response = await handleCallback(request, {
		exchangeIdentity: providerExchange,
		bindExistingMember: async (identity) =>
			identity.bojHandle === "existing-boj"
				? { userId: 41, solvedAcId: identity.solvedAcId }
				: null,
	});
	// Then the signed cookie contains stable identity and no provider credential.
	const session = response.cookies.get("anabada_session");
	const token = session?.value;
	expect(response.status).toBe(303);
	expect(response.headers.get("location")).toBe("http://localhost:20030/");
	expect(await verifySession(token ?? "", key)).toEqual({
		userId: 41,
		solvedAcId: "871",
	});
	expect(session?.httpOnly).toBe(true);
	const maxAge = 7 * 24 * 60 * 60;
	expect(session?.maxAge).toBe(maxAge);
	const claims = decodeJwt(token ?? "");
	expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(maxAge);
	expect(JSON.stringify(claims)).not.toContain("server-only-provider-token");
	expect(response.cookies.get("anabada_oauth")?.maxAge).toBe(0);
	expectedChallenge = challenge;
});

test("denies unregistered members without issuing a session when OAuth succeeds", async () => {
	// Given an authenticated provider identity absent from membership storage.
	const request = await callback();
	// When the callback resolves membership.
	const response = await handleCallback(request, {
		exchangeIdentity: providerExchange,
		bindExistingMember: async () => null,
	});
	// Then it routes to enrollment guidance without an auth cookie.
	expect(response.headers.get("location")).toBe(
		"http://localhost:20030/login?error=not_member",
	);
	expect(response.cookies.has("anabada_session")).toBe(false);
});

test("rejects a mismatched state before contacting the provider", async () => {
	// Given a callback with a different state.
	const request = await callback("x".repeat(43));
	const before = tokenCalls;
	// When processing it.
	const response = await handleCallback(request, {
		exchangeIdentity: providerExchange,
		bindExistingMember: async () => ({ userId: 41, solvedAcId: "871" }),
	});
	// Then the provider was never called and no session exists.
	expect(tokenCalls).toBe(before);
	expect(response.headers.get("location")).toContain("error=invalid_state");
	expect(response.cookies.has("anabada_session")).toBe(false);
});

test("rejects unverified BOJ ownership when the provider profile is read", async () => {
	// Given an unverified BOJ link.
	verified = false;
	// When identity is exchanged.
	const result = exchangeIdentity(
		config,
		"provider-code",
		verifier,
		provider.url.origin,
	);
	// Then it cannot authenticate membership.
	await expect(result).rejects.toBeInstanceOf(ProviderIdentityError);
	verified = true;
});

test("rejects a different profile id when a handle changes during login", async () => {
	// Given the handle now resolves to a different account.
	profileId = 872;
	// When the profile is read.
	const result = exchangeIdentity(
		config,
		"provider-code",
		verifier,
		provider.url.origin,
	);
	// Then the stable identity mismatch fails closed.
	await expect(result).rejects.toBeInstanceOf(ProviderIdentityError);
	profileId = 871;
});

test("rejects a forged signature when verifying a local session", async () => {
	// Given a token signed with an attacker's key.
	const token = await signSession(
		{ userId: 41, solvedAcId: "871" },
		new TextEncoder().encode("attacker-key"),
	);
	// When verifying it.
	const identity = await verifySession(token, key);
	// Then no identity is returned.
	expect(identity).toBeNull();
});

test("rejects expired sessions when a valid signature has expired", async () => {
	// Given an expired but correctly signed token.
	const token = await new SignJWT({ solvedAcId: "871" })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject("41")
		.setIssuer("anabada")
		.setAudience("anabada-web")
		.setIssuedAt(1)
		.setExpirationTime(2)
		.sign(key);
	// When checking it.
	const identity = await verifySession(token, key);
	// Then no session survives expiration.
	expect(identity).toBeNull();
});

test("rejects expired OAuth state when the callback arrives too late", async () => {
	// Given an expired state cookie.
	const token = await new SignJWT({ state, verifier })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("anabada")
		.setAudience("anabada-oauth")
		.setIssuedAt(1)
		.setExpirationTime(2)
		.sign(key);
	// When checking state.
	const result = await verifyOAuthState(token, state, key);
	// Then no verifier is exposed.
	expect(result).toBeNull();
});

test("rejects cross-origin logout when another site posts", async () => {
	// Given a cross-origin request.
	const request = new Request("http://localhost:20030/auth/logout", {
		method: "POST",
		headers: { origin: "https://attacker.invalid" },
	});
	// When logout is requested.
	const response = await logout(request);
	// Then cookies are unchanged.
	expect(response.status).toBe(403);
	expect(response.headers.has("set-cookie")).toBe(false);
});

test("clears session and old admin cookies when same-origin logout succeeds", async () => {
	// Given a same-origin request.
	const request = new Request("http://localhost:20030/auth/logout", {
		method: "POST",
		headers: { origin: "http://localhost:20030" },
	});
	// When logout is requested.
	const response = await logout(request);
	// Then all local authentication cookies are expired.
	expect(response.status).toBe(303);
	expect(response.headers.get("set-cookie")).toContain(
		"anabada_session=; Path=/; Max-Age=0",
	);
	expect(response.headers.get("set-cookie")).toContain(
		"accessToken=; Path=/; Max-Age=0",
	);
});
