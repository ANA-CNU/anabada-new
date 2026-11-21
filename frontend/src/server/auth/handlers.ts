import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
	appOrigin,
	cookieOptions,
	oauthConfig,
	sessionCookie,
	sessionKey,
	sessionSeconds,
	stateCookie,
} from "./config";
import { bindExistingMember } from "./accounts";
import {
	authorizationUrl,
	exchangeIdentity,
	ProviderIdentityError,
} from "./provider";
import { signOAuthState, signSession, verifyOAuthState } from "./tokens";

function loginFailure(error: string) {
	const response = NextResponse.redirect(
		new URL(`/login?error=${error}`, appOrigin()),
		303,
	);
	response.cookies.set(stateCookie, "", cookieOptions(0));
	response.headers.set("Cache-Control", "no-store");
	return response;
}

export async function startLogin() {
	// no-excuse-ok: catch — route boundary keeps credentials and configuration errors out of responses.
	try {
		const config = oauthConfig();
		const key = sessionKey();
		const state = randomBytes(32).toString("base64url");
		const verifier = randomBytes(32).toString("base64url");
		const challenge = createHash("sha256").update(verifier).digest("base64url");
		const response = NextResponse.redirect(
			authorizationUrl(config, state, challenge),
		);
		response.cookies.set(
			stateCookie,
			await signOAuthState(state, verifier, key),
			cookieOptions(600),
		);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch (error) {
		if (error instanceof Error) return loginFailure("unavailable");
		throw error;
	}
}

const callbackSchema = z.object({
	code: z.string().min(1).max(4096),
	state: z.string().min(32).max(256),
});
export function finishLogin(request: NextRequest) {
	return handleCallback(request, { exchangeIdentity, bindExistingMember });
}

export async function handleCallback(
	request: NextRequest,
	dependencies: Readonly<{
		exchangeIdentity: typeof exchangeIdentity;
		bindExistingMember: typeof bindExistingMember;
	}>,
) {
	// no-excuse-ok: catch — all provider/database failures fail closed at this route boundary.
	try {
		if (request.nextUrl.searchParams.has("error"))
			return loginFailure("cancelled");
		const parsed = callbackSchema.safeParse(
			Object.fromEntries(request.nextUrl.searchParams),
		);
		const pending = request.cookies.get(stateCookie)?.value;
		if (!parsed.success || !pending) return loginFailure("invalid_state");
		const key = sessionKey();
		const verifier = await verifyOAuthState(pending, parsed.data.state, key);
		if (!verifier) return loginFailure("invalid_state");
		const provider = await dependencies.exchangeIdentity(
			oauthConfig(),
			parsed.data.code,
			verifier,
		);
		const member = await dependencies.bindExistingMember(provider);
		if (!member) return loginFailure("not_member");
		const response = NextResponse.redirect(new URL("/", appOrigin()), 303);
		response.cookies.set(
			sessionCookie,
			await signSession(member, key),
			cookieOptions(sessionSeconds),
		);
		response.cookies.set(stateCookie, "", cookieOptions(0));
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch (error) {
		if (error instanceof ProviderIdentityError)
			return loginFailure("boj_required");
		if (error instanceof Error) return loginFailure("unavailable");
		throw error;
	}
}

export async function logout(request: Request) {
	if (request.headers.get("origin") !== appOrigin())
		return new Response("Forbidden", { status: 403 });
	const response = NextResponse.redirect(new URL("/login", appOrigin()), 303);
	response.cookies.set(sessionCookie, "", cookieOptions(0));
	response.cookies.set(stateCookie, "", cookieOptions(0));
	response.cookies.set("accessToken", "", cookieOptions(0));
	response.headers.set("Cache-Control", "no-store");
	return response;
}
