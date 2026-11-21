import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSession } from "./accounts";
import { sessionCookie, sessionKey } from "./config";
import { verifySession } from "./tokens";
export type { Session } from "./accounts";

export const getSession = cache(async function getSession() {
	const token = (await cookies()).get(sessionCookie)?.value;
	if (!token) return null;
	const identity = await verifySession(token, sessionKey());
	return identity ? findSession(identity) : null;
});
export async function requireSession() {
	const session = await getSession();
	if (!session) redirect("/login");
	return session;
}
export async function requireAdmin() {
	const session = await requireSession();
	if (!session.isAdmin) redirect("/login?error=admin_required");
	return session;
}
