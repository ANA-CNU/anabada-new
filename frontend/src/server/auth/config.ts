import "server-only";
import { z } from "zod";

export const sessionCookie = "anabada_session";
export const stateCookie = "anabada_oauth";
export const sessionIssuer = "anabada";
export const sessionAudience = "anabada-web";
export const sessionSeconds = 7 * 24 * 60 * 60;

export function sessionKey() {
	return new TextEncoder().encode(
		z.string().min(32).parse(process.env.JWT_SECRET),
	);
}

export function appOrigin() {
	const value = new URL(z.string().url().parse(process.env.APP_ORIGIN));
	if (
		value.protocol !== "https:" &&
		!(
			value.protocol === "http:" &&
			["localhost", "127.0.0.1"].includes(value.hostname)
		)
	) {
		throw new AuthConfigurationError();
	}
	return value.origin;
}

export function oauthConfig() {
	return {
		clientId: z.string().min(1).parse(process.env.SOLVED_AC_CLIENT_ID),
		clientSecret: z.string().min(1).parse(process.env.SOLVED_AC_CLIENT_SECRET),
		redirectUri: `${appOrigin()}/auth/solved-ac/callback`,
	};
}

export function cookieOptions(maxAge: number) {
	return {
		httpOnly: true,
		secure: appOrigin().startsWith("https:"),
		sameSite: "lax" as const,
		path: "/",
		maxAge,
	};
}

export class AuthConfigurationError extends Error {
	constructor() {
		super("Authentication configuration is invalid");
		this.name = "AuthConfigurationError";
	}
}
