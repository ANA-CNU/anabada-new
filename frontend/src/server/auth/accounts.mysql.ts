import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock } from "bun:test";

assert.equal(
	process.env.AUTH_MYSQL_FIXTURE,
	"disposable",
	"This harness requires an explicit disposable DB",
);
mock.module("server-only", () => ({}));
const { db } = await import("../db");
const { bindExistingMember, findSession } = await import("./accounts");
try {
	for (const filename of [
		"006_create_boj_bada.sql",
		"013_accounts_and_board.sql",
	]) {
		const sql = await readFile(
			new URL(`../../../../migrations/${filename}`, import.meta.url),
			"utf8",
		);
		for (const statement of sql.split(";").filter((part) => part.trim()))
			await db.query(statement);
	}
	await db.execute(
		"INSERT INTO user(id,handle,korean_name,ignored) VALUES(41,'alpha','알파',0),(42,'inactive',NULL,1)",
	);
	const account = {
		solvedAcId: "871",
		solvedAcHandle: "provider-handle",
		bojHandle: "alpha",
	};
	const identity = await bindExistingMember(account);
	assert.deepEqual(identity, { userId: 41, solvedAcId: "871" });
	console.log("PASS existing verified BOJ member binds to stable solved.ac ID");
	assert.equal(
		await bindExistingMember({
			solvedAcId: "872",
			solvedAcHandle: "outsider",
			bojHandle: "unregistered",
		}),
		null,
	);
	const [count] = await db.query("SELECT COUNT(*) AS total FROM user");
	assert.deepEqual(JSON.parse(JSON.stringify(count)), [{ total: "2" }]);
	console.log(
		"PASS unknown provider identity is denied and user count remains 2",
	);
	assert.equal(
		await bindExistingMember({
			solvedAcId: "873",
			solvedAcHandle: "inactive-provider",
			bojHandle: "inactive",
		}),
		null,
	);
	console.log("PASS ignored member cannot authenticate");
	assert.equal(
		await bindExistingMember({ ...account, solvedAcId: "999" }),
		null,
	);
	console.log("PASS a second solved.ac account cannot claim a bound member");
	assert.deepEqual(
		await bindExistingMember({
			...account,
			solvedAcHandle: "renamed-provider",
			bojHandle: "changed-handle",
		}),
		identity,
	);
	console.log(
		"PASS immutable identity preserves binding across handle changes",
	);
	assert.ok(identity);
	assert.deepEqual(await findSession(identity), {
		userId: 41,
		handle: "alpha",
		displayName: "알파",
		isAdmin: false,
	});
	await db.execute("INSERT INTO admin_users(user_id) VALUES(41)");
	assert.equal((await findSession(identity))?.isAdmin, true);
	await db.execute("DELETE FROM admin_users WHERE user_id=41");
	assert.equal((await findSession(identity))?.isAdmin, false);
	console.log(
		"PASS database admin grant and revocation affect the next session read",
	);
	await db.execute("UPDATE user SET ignored=1 WHERE id=41");
	assert.equal(await findSession(identity), null);
	console.log("PASS ignoring a member invalidates their existing session");
	console.log("AUTH_MYSQL_PASS=7");
} finally {
	await db.end();
}
