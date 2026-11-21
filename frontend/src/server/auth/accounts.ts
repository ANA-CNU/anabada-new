import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { SolvedIdentity } from "./provider";
import type { SessionIdentity } from "./tokens";

const userSchema = z.object({
	userId: z.number().int().positive(),
	handle: z.string(),
	displayName: z.string(),
	isAdmin: z
		.union([z.literal(0), z.literal(1), z.literal("0"), z.literal("1")])
		.transform((value) => value === 1 || value === "1"),
});
export type Session = Readonly<z.infer<typeof userSchema>>;
const columns =
	"u.id AS userId,u.handle,COALESCE(NULLIF(u.korean_name,''),u.handle) AS displayName,EXISTS(SELECT 1 FROM admin_users a WHERE a.user_id=u.id) AS isAdmin";

export async function findSession(
	identity: SessionIdentity,
): Promise<Session | null> {
	const [rows] = await db.query({
		sql: `SELECT ${columns} FROM user u JOIN solved_ac_accounts s ON s.user_id=u.id WHERE u.id=? AND s.solved_ac_id=? AND u.ignored=0 LIMIT 1`,
		values: [identity.userId, identity.solvedAcId],
		timeout: 5000,
	});
	return z.array(userSchema).parse(rows)[0] ?? null;
}

export async function bindExistingMember(
	identity: SolvedIdentity,
): Promise<SessionIdentity | null> {
	const connection = await db.getConnection();
	try {
		await connection.beginTransaction();
		const [existing] = await connection.query({
			sql: "SELECT s.user_id AS userId FROM solved_ac_accounts s JOIN user u ON u.id=s.user_id WHERE s.solved_ac_id=? AND u.ignored=0 FOR UPDATE",
			values: [identity.solvedAcId],
			timeout: 5000,
		});
		const bound = z
			.array(z.object({ userId: z.number().int().positive() }))
			.parse(existing)[0];
		if (bound) {
			await connection.commit();
			return { userId: bound.userId, solvedAcId: identity.solvedAcId };
		}
		const [members] = await connection.query({
			sql: "SELECT id AS userId FROM user WHERE handle=? AND ignored=0 FOR UPDATE",
			values: [identity.bojHandle],
			timeout: 5000,
		});
		const member = z
			.array(z.object({ userId: z.number().int().positive() }))
			.parse(members)[0];
		if (!member) {
			await connection.rollback();
			return null;
		}
		const [links] = await connection.query({
			sql: "SELECT solved_ac_id FROM solved_ac_accounts WHERE user_id=? FOR UPDATE",
			values: [member.userId],
			timeout: 5000,
		});
		if (z.array(z.unknown()).parse(links).length !== 0) {
			await connection.rollback();
			return null;
		}
		await connection.execute(
			"INSERT INTO solved_ac_accounts(solved_ac_id,user_id,solved_ac_handle) VALUES(?,?,?)",
			[identity.solvedAcId, member.userId, identity.solvedAcHandle],
		);
		await connection.commit();
		return { userId: member.userId, solvedAcId: identity.solvedAcId };
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}
