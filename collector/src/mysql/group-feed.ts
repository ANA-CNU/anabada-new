import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { z } from "zod";
import { type AccountId, accountIdSchema } from "../domain/sync.js";
import { problemIdSchema, submissionIdSchema } from "../domain.js";
import type { GroupAcceptedSubmission } from "../group-domain.js";
import { PersistenceError } from "./account-types.js";

export type CollectorCheckpoint = {
  readonly committedCursor: string;
  readonly upperSubmissionId: string | null;
  readonly windowLowerCursor: string | null;
  readonly paginationCursor: string | null;
  readonly lastScannedSubmissionId: string | null;
  readonly phase: "idle" | "collecting" | "settling";
  readonly overlapObservedCount: number;
  readonly cursorReached: boolean;
};

export type InboxSubmission = GroupAcceptedSubmission;

export type SettlementInboxRow = {
  readonly externalSubmissionId: ReturnType<typeof submissionIdSchema.parse>;
  readonly accountId: AccountId;
  readonly problemId: ReturnType<typeof problemIdSchema.parse>;
  readonly submittedAt: Date;
  readonly score: number | null;
};

interface CheckpointRow extends RowDataPacket {
  readonly committedCursor: string;
  readonly upperSubmissionId: string | null;
  readonly windowLowerCursor: string | null;
  readonly paginationCursor: string | null;
  readonly lastScannedSubmissionId: string | null;
  readonly phase: string;
  readonly overlapObservedCount: number;
  readonly cursorReached: number;
}
interface InboxRow extends RowDataPacket {
  readonly externalSubmissionId: string;
  readonly accountId: string;
  readonly problemId: number;
  readonly submittedAt: Date;
  readonly score: string | number | null;
}
interface CountRow extends RowDataPacket {
  readonly total: string;
}

/** 그룹 feed의 checkpoint·inbox SQL만 담당하며 transaction 경계는 호출자가 소유한다. */
export class GroupFeedRepository {
  constructor(private readonly connection: PoolConnection) {}

  async lockCheckpoint(groupId: string): Promise<CollectorCheckpoint | null> {
    const [rows] = await this.connection.execute<CheckpointRow[]>(
      "SELECT committed_cursor AS committedCursor, window_upper_submission_id AS upperSubmissionId, window_lower_cursor AS windowLowerCursor, pagination_cursor AS paginationCursor, last_scanned_submission_id AS lastScannedSubmissionId, phase, overlap_observed_count AS overlapObservedCount, cursor_reached AS cursorReached FROM collector_checkpoint WHERE group_id=? FOR UPDATE",
      [groupId],
    );
    const row = rows[0];
    if (!row) return null;
    return checkpointSchema.parse(row);
  }

  async insertCheckpoint(
    groupId: string,
    upperSubmissionId: string,
  ): Promise<void> {
    await this.connection.execute(
      "INSERT INTO collector_checkpoint (group_id,committed_cursor,phase) VALUES (?,?,'idle')",
      [groupId, upperSubmissionId],
    );
  }

  async advanceCollection(input: {
    readonly groupId: string;
    readonly upperSubmissionId: string;
    readonly lowerCursor: string;
    readonly paginationCursor: string | null;
    readonly lastScannedSubmissionId: string | null;
    readonly overlapObservedCount: number;
    readonly cursorReached: boolean;
  }): Promise<void> {
    await this.connection.execute(
      "UPDATE collector_checkpoint SET window_upper_submission_id=?,window_lower_cursor=?,pagination_cursor=?,last_scanned_submission_id=?,overlap_observed_count=?,cursor_reached=?,phase=IF(?,'settling','collecting') WHERE group_id=?",
      [
        input.upperSubmissionId,
        input.lowerCursor,
        input.paginationCursor,
        input.lastScannedSubmissionId,
        input.overlapObservedCount,
        input.cursorReached,
        input.cursorReached,
        input.groupId,
      ],
    );
  }

  async resetPagination(groupId: string): Promise<void> {
    await this.connection.execute(
      "UPDATE collector_checkpoint SET pagination_cursor=NULL,last_scanned_submission_id=NULL,overlap_observed_count=0,phase='collecting' WHERE group_id=? AND phase='collecting'",
      [groupId],
    );
  }

  async finalizeWhenInboxEmpty(groupId: string): Promise<boolean> {
    const checkpoint = await this.lockCheckpoint(groupId);
    if (
      !checkpoint ||
      checkpoint.phase !== "settling" ||
      checkpoint.upperSubmissionId === null ||
      !checkpoint.cursorReached
    )
      return false;
    const [rows] = await this.connection.execute<CountRow[]>(
      "SELECT COUNT(*) AS total FROM collector_ac_inbox WHERE group_id=? FOR UPDATE",
      [groupId],
    );
    if (Number(rows[0]?.total) !== 0) return false;
    const [result] = await this.connection.execute<ResultSetHeader>(
      "UPDATE collector_checkpoint SET committed_cursor=window_upper_submission_id,window_upper_submission_id=NULL,window_lower_cursor=NULL,pagination_cursor=NULL,last_scanned_submission_id=NULL,overlap_observed_count=0,cursor_reached=0,phase='idle' WHERE group_id=? AND phase='settling' AND cursor_reached=1 AND window_upper_submission_id IS NOT NULL",
      [groupId],
    );
    return result.affectedRows === 1;
  }

  async appendInbox(
    groupId: string,
    submissions: readonly InboxSubmission[],
  ): Promise<void> {
    for (const submission of submissions) {
      const [rows] = await this.connection.execute<InboxRow[]>(
        "SELECT external_submission_id AS externalSubmissionId, jungol_account_id AS accountId, problem AS problemId, submitted_at AS submittedAt, score FROM collector_ac_inbox WHERE external_submission_id=? FOR UPDATE",
        [submission.submissionId],
      );
      const existing = rows[0];
      if (existing) {
        if (
          existing.accountId !== submission.accountId ||
          existing.problemId !== submission.problemId
        )
          throw new PersistenceError("submission_conflict");
        continue;
      }
      await this.connection.execute<ResultSetHeader>(
        "INSERT INTO collector_ac_inbox (external_submission_id,group_id,jungol_account_id,problem,submitted_at,score) VALUES (?,?,?,?,?,?)",
        [
          submission.submissionId,
          groupId,
          submission.accountId,
          submission.problemId,
          submission.submittedAt,
          submission.score,
        ],
      );
    }
  }

  async readSettlementBatch(
    groupId: string,
    limit = 200,
    maxUsers = 10,
  ): Promise<readonly SettlementInboxRow[]> {
    this.ensureSettlementBounds(limit, maxUsers);
    const [rows] = await this.connection.query<InboxRow[]>(
      "SELECT external_submission_id AS externalSubmissionId, jungol_account_id AS accountId, problem AS problemId, submitted_at AS submittedAt, score FROM collector_ac_inbox WHERE group_id=? ORDER BY submitted_at ASC, external_submission_id ASC LIMIT ?",
      [groupId, limit],
    );
    const accounts = new Set<string>();
    return rows
      .filter((row) => {
        if (accounts.has(row.accountId)) return true;
        if (accounts.size === maxUsers) return false;
        accounts.add(row.accountId);
        return true;
      })
      .map((row) => this.parseInbox(row));
  }

  async readOldestForAccount(
    groupId: string,
    accountId: string,
    limit: number,
  ): Promise<readonly SettlementInboxRow[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new RangeError("invalid_group_settlement_limit");
    const [rows] = await this.connection.query<InboxRow[]>(
      "SELECT external_submission_id AS externalSubmissionId, jungol_account_id AS accountId, problem AS problemId, submitted_at AS submittedAt, score FROM collector_ac_inbox WHERE group_id=? AND jungol_account_id=? ORDER BY submitted_at ASC, external_submission_id ASC LIMIT ? FOR UPDATE",
      [groupId, accountId, limit],
    );
    return rows.map((row) => this.parseInbox(row));
  }

  async deleteInbox(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.connection.query(
      "DELETE FROM collector_ac_inbox WHERE external_submission_id IN (?)",
      [ids],
    );
  }

  async deleteInboxForAccount(
    groupId: string,
    accountId: string,
    ids: readonly string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.connection.query(
      "DELETE FROM collector_ac_inbox WHERE group_id=? AND jungol_account_id=? AND external_submission_id IN (?)",
      [groupId, accountId, ids],
    );
  }

  private parseInbox(row: InboxRow): SettlementInboxRow {
    return {
      externalSubmissionId: submissionIdSchema.parse(row.externalSubmissionId),
      accountId: accountIdSchema.parse(row.accountId),
      problemId: problemIdSchema.parse(row.problemId),
      submittedAt: row.submittedAt,
      score:
        row.score === null ? null : z.coerce.number().finite().parse(row.score),
    };
  }

  private ensureSettlementBounds(limit: number, maxUsers: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new RangeError("invalid_group_settlement_limit");
    if (!Number.isSafeInteger(maxUsers) || maxUsers < 1 || maxUsers > 10)
      throw new RangeError("invalid_group_settlement_user_limit");
  }
}

const checkpointSchema = z.object({
  committedCursor: z.string().regex(/^[0-9]+$/),
  upperSubmissionId: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
  windowLowerCursor: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
  paginationCursor: z.string().nullable(),
  lastScannedSubmissionId: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
  phase: z.enum(["idle", "collecting", "settling"]),
  overlapObservedCount: z.number().int().nonnegative(),
  cursorReached: z
    .union([z.literal(0), z.literal(1)])
    .transform((value) => value === 1),
});
