import ky from "ky";
import { z } from "zod";

export type OAuthConfig = Readonly<{
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}>;
const accountSchema = z.object({
	id: z.number().int().positive().safe(),
	handle: z.string().min(1).max(64),
});
const profileSchema = accountSchema.extend({
	ojAccounts: z.array(
		z.object({
			ojId: z.string(),
			handle: z.string().min(1).max(50),
			verified: z.boolean(),
		}),
	),
});
const tokenSchema = z.object({
	access_token: z.string().min(1),
	token_type: z.literal("Bearer"),
	expires_in: z.number().positive(),
	scope: z.string(),
});
export type SolvedIdentity = Readonly<{
	solvedAcId: string;
	solvedAcHandle: string;
	bojHandle: string;
}>;

export class ProviderIdentityError extends Error {
	constructor() {
		super("A verified BOJ account is required");
		this.name = "ProviderIdentityError";
	}
}

export function authorizationUrl(
	config: OAuthConfig,
	state: string,
	challenge: string,
) {
	const url = new URL("https://solved.ac/oauth/authorize");
	url.search = new URLSearchParams({
		response_type: "code",
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		scope: "profile",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
	}).toString();
	return url;
}

export async function exchangeIdentity(
	config: OAuthConfig,
	code: string,
	verifier: string,
	origin = "https://solved.ac",
): Promise<SolvedIdentity> {
	const client = ky.create({
		prefixUrl: origin,
		timeout: 10_000,
		retry: 0,
		redirect: "error",
		headers: {
			"x-client-id": config.clientId,
			"x-client-secret": config.clientSecret,
		},
	});
	const tokens = tokenSchema.parse(
		await client
			.post("api/v4/oauth/token", {
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: config.redirectUri,
					code_verifier: verifier,
				}),
			})
			.json(),
	);
	if (!tokens.scope.split(" ").includes("profile"))
		throw new ProviderIdentityError();
	const headers = { Authorization: `Bearer ${tokens.access_token}` };
	const account = accountSchema.parse(
		await client.get("api/v4/me", { headers }).json(),
	);
	const profile = profileSchema.parse(
		await client
			.get(`api/v4/users/${encodeURIComponent(account.handle)}`, { headers })
			.json(),
	);
	const boj = profile.ojAccounts.filter(
		(entry) => entry.ojId === "boj" && entry.verified,
	);
	if (profile.id !== account.id || boj.length !== 1 || !boj[0])
		throw new ProviderIdentityError();
	return {
		solvedAcId: String(account.id),
		solvedAcHandle: account.handle,
		bojHandle: boj[0].handle,
	};
}
