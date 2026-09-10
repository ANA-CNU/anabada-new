import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { RankMemberSnapshot } from "../domain/sync.js";
import { PersistenceError } from "./account-types.js";

export interface StoredUser extends RowDataPacket {
  readonly id: number;
  readonly accountId: string;
  readonly jungolName: string;
  readonly solvedCount: number;
  readonly wrongCount: number;
  readonly acRating: number;
  readonly tier: number;
  readonly cursor: string;
}

export interface LockedUser extends RowDataPacket {
  readonly id: number;
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

/** user 테이블 SQL만 소유하며 transaction 시작·종료 권한은 갖지 않는다. */
export class UserRepository {
  constructor(private readonly connection: PoolConnection) {}

  async readAll(): Promise<readonly StoredUser[]> {
    const [rows] = await this.connection.execute<StoredUser[]>(
      "SELECT id, jungol_account_id AS accountId, jungol_name AS jungolName, corrects AS solvedCount, rank_wrong_count AS wrongCount, ac_rating AS acRating, tier, solution AS `cursor` FROM user",
    );
    return rows;
  }

  async upsertAndLock(member: RankMemberSnapshot): Promise<LockedUser> {
    await this.connection.execute(
      "INSERT INTO user (jungol_name,jungol_account_id) VALUES (?,?) ON DUPLICATE KEY UPDATE id=id",
      [member.jungolName, member.accountId],
    );
    return this.lockExisting(member.accountId);
  }

  async registerAndReadInitialization(
    member: RankMemberSnapshot,
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
      "SELECT id,solution,corrects,submissions,tier,initialized_at AS initializedAt,initial_submission_id AS initialSubmissionId FROM user WHERE jungol_account_id=? FOR UPDATE",
      [accountId],
    );
    const user = rows[0];
    if (!user) throw new PersistenceError("account_conflict");
    return user;
  }

  async refreshMetadata(member: RankMemberSnapshot): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, rank_wrong_count=?, ac_rating=?, tier=? WHERE jungol_account_id=?",
      [
        member.jungolName,
        member.wrongCount,
        member.acRating,
        member.tier,
        member.accountId,
      ],
    );
  }

  async completeSync(input: {
    readonly userId: number;
    readonly member: RankMemberSnapshot;
    readonly highestInspectedSubmissionId: bigint;
  }): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, corrects=(SELECT COUNT(DISTINCT problem) FROM problem WHERE user_id=?), submissions=(SELECT COUNT(*) FROM problem WHERE user_id=?), solution=?, rank_wrong_count=?, ac_rating=?, tier=? WHERE id=?",
      [
        input.member.jungolName,
        input.userId,
        input.userId,
        input.highestInspectedSubmissionId.toString(),
        input.member.wrongCount,
        input.member.acRating,
        input.member.tier,
        input.userId,
      ],
    );
  }

  async completeInitialization(input: {
    readonly userId: number;
    readonly member: RankMemberSnapshot;
    readonly solvedCount: number;
    readonly highestInspectedSubmissionId: bigint;
    readonly initializedAt: Date;
  }): Promise<void> {
    await this.connection.execute(
      "UPDATE user SET jungol_name=?, corrects=?, submissions=?, solution=?, initial_submission_id=?, initialized_at=?, rank_wrong_count=?, ac_rating=?, tier=? WHERE id=?",
      [
        input.member.jungolName,
        input.solvedCount,
        input.solvedCount,
        "0",
        input.highestInspectedSubmissionId.toString(),
        input.initializedAt,
        input.member.wrongCount,
        input.member.acRating,
        input.member.tier,
        input.userId,
      ],
    );
  }
}
