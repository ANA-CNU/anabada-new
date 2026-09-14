import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { GroupMemberSnapshot } from "../domain/sync.js";
import { PersistenceError } from "./account-types.js";

export interface LockedUser extends RowDataPacket {
  readonly id: number;
  readonly accountId: string;
  readonly solution: string;
  readonly corrects: number;
  readonly submissions: number;
  readonly tier: number;
  readonly initializedAt: Date | null;
  readonly initialSubmissionId: string | null;
}

export type UserInitializationState = {
  readonly accountId: string;
  readonly initialized: boolean;
};

export interface PreparedUserState extends RowDataPacket {
  readonly accountId: string;
  readonly id: number;
  readonly solution: string;
  readonly corrects: number;
  readonly submissions: number;
  readonly tier: number;
  readonly initializedAt: Date | null;
  readonly initialSubmissionId: string | null;
}

/** user 테이블 SQL만 소유하며 transaction 시작·종료 권한은 갖지 않는다. */
export class UserRepository {
  constructor(private readonly connection: PoolConnection) {}

  async upsertAndLock(member: GroupMemberSnapshot): Promise<LockedUser> {
    await this.connection.execute(
      "INSERT INTO user (jungol_name,jungol_account_id,ignored) VALUES (?,?,1) ON DUPLICATE KEY UPDATE id=id",
      [member.jungolName, member.accountId],
    );
    return this.lockExisting(member.accountId);
  }

  async registerAndReadInitialization(
    member: GroupMemberSnapshot,
  ): Promise<UserInitializationState> {
    const user = await this.upsertAndLock(member);
    return {
      accountId: member.accountId,
      initialized:
        user.initializedAt !== null && user.initialSubmissionId !== null,
    };
  }

  async lockExisting(accountId: string): Promise<LockedUser> {
    const [rows] = await this.connection.execute<LockedUser[]>(
      "SELECT id,jungol_account_id AS accountId,solution,corrects,submissions,tier,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id=? FOR UPDATE",
      [accountId],
    );
    const user = rows[0];
    if (!user) throw new PersistenceError("account_conflict");
    return user;
  }

  async readInitializationStates(
    accountIds: readonly string[],
  ): Promise<ReadonlyMap<string, PreparedUserState>> {
    if (accountIds.length === 0) return new Map();
    const [rows] = await this.connection.query<PreparedUserState[]>(
      "SELECT id,jungol_account_id AS accountId,solution,corrects,submissions,tier,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id IN (?)",
      [accountIds],
    );
    return new Map(rows.map((row) => [row.accountId, row]));
  }

  async lockRegisteredMembers(
    members: readonly GroupMemberSnapshot[],
  ): Promise<{
    readonly users: readonly LockedUser[];
    readonly insertedAccountIds: ReadonlySet<string>;
  }> {
    if (members.length === 0)
      return { users: [], insertedAccountIds: new Set() };
    const accountIds = members.map((member) => member.accountId);
    const [existing] = await this.connection.query<LockedUser[]>(
      "SELECT id,jungol_account_id AS accountId,solution,corrects,submissions,tier,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id IN (?) ORDER BY id ASC FOR UPDATE",
      [accountIds],
    );
    const existingIds = new Set(existing.map((user) => user.accountId));
    const insertedAccountIds = new Set<string>();
    for (const member of members
      .filter((member) => !existingIds.has(member.accountId))
      .sort((left, right) => left.accountId.localeCompare(right.accountId))) {
      try {
        await this.connection.execute(
          "INSERT INTO user (jungol_name,jungol_account_id,ignored) VALUES (?,?,1)",
          [member.jungolName, member.accountId],
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ER_DUP_ENTRY"
        )
          throw new PersistenceError("stale_snapshot");
        throw error;
      }
      insertedAccountIds.add(member.accountId);
    }
    const [rows] = await this.connection.query<LockedUser[]>(
      "SELECT id,jungol_account_id AS accountId,solution,corrects,submissions,tier,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id IN (?) ORDER BY id ASC FOR UPDATE",
      [accountIds],
    );
    if (rows.length !== members.length)
      throw new PersistenceError("account_conflict");
    return { users: rows, insertedAccountIds };
  }

  async refreshMetadata(member: GroupMemberSnapshot): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, tier=? WHERE jungol_account_id=?",
      [member.jungolName, member.tier, member.accountId],
    );
  }

  async completeSync(input: {
    readonly userId: number;
    readonly member: GroupMemberSnapshot;
    readonly highestInspectedSubmissionId: bigint;
  }): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, corrects=(SELECT COUNT(DISTINCT problem) FROM problem WHERE user_id=?), submissions=(SELECT COUNT(*) FROM problem WHERE user_id=?), solution=?, tier=? WHERE id=?",
      [
        input.member.jungolName,
        input.userId,
        input.userId,
        input.highestInspectedSubmissionId.toString(),
        input.member.tier,
        input.userId,
      ],
    );
  }

  async completeInitialization(input: {
    readonly userId: number;
    readonly member: GroupMemberSnapshot;
    readonly solvedCount: number;
    readonly highestInspectedSubmissionId: bigint;
    readonly initializedAt: Date;
  }): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, corrects=?, submissions=?, solution=?, initial_submission_id=?, initialized_at=?, tier=? WHERE id=?",
      [
        input.member.jungolName,
        input.solvedCount,
        input.solvedCount,
        "0",
        input.highestInspectedSubmissionId.toString(),
        input.initializedAt,
        input.member.tier,
        input.userId,
      ],
    );
  }
}
