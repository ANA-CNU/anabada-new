import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { AcceptedAttempt } from "../domain/sync.js";
import { PersistenceError } from "./account-types.js";

interface AttemptRow extends RowDataPacket {
  readonly problem: number;
  readonly count: string;
}
interface DuplicateRow extends RowDataPacket {
  readonly user_id: number;
  readonly problem: number;
  readonly external_submission_id: string;
}
/** AC 제출 원장 SQL만 수행하며 외부 제출 번호 충돌을 중복으로 숨기지 않는다. */
export class AttemptRepository {
  constructor(private readonly connection: PoolConnection) {}

  async readSolvedCounts(userId: number): Promise<Map<number, number>> {
    const [rows] = await this.connection.execute<AttemptRow[]>(
      "SELECT problem, COUNT(*) AS count FROM problem WHERE user_id=? GROUP BY problem",
      [userId],
    );
    return new Map(rows.map((row) => [row.problem, Number(row.count)]));
  }

  async readDuplicates(
    userId: number,
    attempts: readonly AcceptedAttempt[],
  ): Promise<ReadonlySet<string>> {
    if (attempts.length === 0) return new Set();
    const [rows] = await this.connection.query<DuplicateRow[]>(
      "SELECT user_id, problem, external_submission_id FROM problem WHERE external_submission_id IN (?)",
      [attempts.map((attempt) => attempt.submissionId)],
    );
    const byId = new Map(
      attempts.map((attempt) => [
        attempt.submissionId.toString(),
        attempt.problemId,
      ]),
    );
    for (const row of rows) {
      if (
        row.user_id !== userId ||
        byId.get(String(row.external_submission_id)) !== row.problem
      )
        throw new PersistenceError("submission_conflict");
    }
    return new Set(rows.map((row) => String(row.external_submission_id)));
  }

  async insert(input: {
    readonly userId: number;
    readonly userTier: number;
    readonly attempt: AcceptedAttempt;
    readonly repetition: number;
  }): Promise<number | null> {
    const { userId, userTier, attempt, repetition } = input;
    const [result] = await this.connection.execute<ResultSetHeader>(
      "INSERT INTO problem (user_id,problem,problem_name,problem_tier,submitted_at,level,repeatation,verdict,external_submission_id,score) VALUES (?,?,?,?,?,?,?,'accepted',?,?) ON DUPLICATE KEY UPDATE id=id",
      [
        userId,
        attempt.problemId,
        attempt.problemName,
        attempt.problemTier,
        attempt.submittedAt,
        attempt.problemTier - userTier,
        repetition,
        attempt.submissionId,
        attempt.score,
      ],
    );
    if (result.affectedRows === 1 && result.insertId > 0)
      return result.insertId;
    const [owners] = await this.connection.execute<DuplicateRow[]>(
      "SELECT user_id,problem,external_submission_id FROM problem WHERE external_submission_id=? FOR UPDATE",
      [attempt.submissionId],
    );
    if (
      owners[0]?.user_id !== userId ||
      owners[0]?.problem !== attempt.problemId
    )
      throw new PersistenceError("submission_conflict");
    return null;
  }
}
