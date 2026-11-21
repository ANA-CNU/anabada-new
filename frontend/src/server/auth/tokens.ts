import { SignJWT, jwtVerify, errors } from "jose";
import { z } from "zod";
import { sessionAudience, sessionIssuer, sessionSeconds } from "./config";

const identityClaims = z.object({
	sub: z.string().regex(/^[1-9]\d*$/),
	solvedAcId: z.string().regex(/^[1-9]\d*$/),
});
export type SessionIdentity = Readonly<{ userId: number; solvedAcId: string }>;

export async function signSession(identity: SessionIdentity, key: Uint8Array) {
	const issuedAt = Math.floor(Date.now() / 1000);
	return new SignJWT({ solvedAcId: identity.solvedAcId })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(String(identity.userId))
		.setIssuer(sessionIssuer)
		.setAudience(sessionAudience)
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + sessionSeconds)
		.sign(key);
}

export async function verifySession(
	token: string,
	key: Uint8Array,
): Promise<SessionIdentity | null> {
	try {
		const { payload } = await jwtVerify(token, key, {
			algorithms: ["HS256"],
			issuer: sessionIssuer,
			audience: sessionAudience,
			requiredClaims: ["exp", "iat", "sub"],
		});
		const parsed = identityClaims.safeParse(payload);
		if (!parsed.success) return null;
		const userId = Number(parsed.data.sub);
		if (!Number.isSafeInteger(userId) || userId > 4_294_967_295) return null;
		return { userId, solvedAcId: parsed.data.solvedAcId };
	} catch (error) {
		if (error instanceof errors.JOSEError) return null;
		throw error;
	}
}

const stateSchema = z.object({
	state: z.string().min(32),
	verifier: z.string().min(43).max(128),
});
export async function signOAuthState(
	state: string,
	verifier: string,
	key: Uint8Array,
) {
	return new SignJWT({ state, verifier })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("anabada")
		.setAudience("anabada-oauth")
		.setIssuedAt()
		.setExpirationTime("10m")
		.sign(key);
}
export async function verifyOAuthState(
	token: string,
	state: string,
	key: Uint8Array,
): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, key, {
			algorithms: ["HS256"],
			issuer: "anabada",
			audience: "anabada-oauth",
			requiredClaims: ["exp", "iat"],
		});
		const parsed = stateSchema.safeParse(payload);
		return parsed.success && parsed.data.state === state
			? parsed.data.verifier
			: null;
	} catch (error) {
		if (error instanceof errors.JOSEError) return null;
		throw error;
	}
}
