import mysql from "mysql2/promise";

function positiveInteger(rawValue, fallback) {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function openPool(maxWorkers) {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "jungol-mysql-poc",
    port: positiveInteger(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_DATABASE ?? "jungol_bada",
    waitForConnections: true,
    connectionLimit: maxWorkers + 2,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

export async function loadStoredUsers(pool) {
  const [rows] = await pool.query(
    "SELECT jungol_account_id, corrects, solution FROM user",
  );
  return new Map(rows.map((row) => [String(row.jungol_account_id), row]));
}

export async function createSyncRun(pool, rankCount) {
  const [result] = await pool.query(
    "INSERT INTO sync_run (status, rank_count) VALUES ('running', ?)",
    [rankCount],
  );
  return result.insertId;
}

export async function completeSyncRun(pool, run) {
  await pool.query(
    `UPDATE sync_run
        SET finished_at = CURRENT_TIMESTAMP(3), status = 'success',
            changed_user_count = ?, worker_count = ?, inserted_attempt_count = ?
      WHERE id = ?`,
    [run.changedAccountCount, run.workerCount, run.insertedAttemptCount, run.id],
  );
}

export async function failSyncRun(pool, runId, error) {
  await pool.query(
    `UPDATE sync_run
        SET finished_at = CURRENT_TIMESTAMP(3), status = 'failed', error_code = ?
      WHERE id = ?`,
    [error instanceof Error ? error.message.slice(0, 100) : "unknown", runId],
  );
}

export async function persistAccount(pool, account, crawlResult) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.query(
      "SELECT id, solution FROM user WHERE jungol_account_id = ? FOR UPDATE",
      [account.accountId],
    );
    let userId;
    if (existingRows.length === 0) {
      const [result] = await connection.query(
        `INSERT INTO user
          (name, corrects, submissions, solution, tier, ignored,
           jungol_account_id, last_rank_seen_at)
         VALUES (?, 0, 0, 0, ?, 0, ?, NOW(3))`,
        [account.handle, account.rating, account.accountId],
      );
      userId = result.insertId;
    } else {
      userId = existingRows[0].id;
    }

    let insertedAttemptCount = 0;
    let committedCursor = BigInt(existingRows[0]?.solution ?? 0);
    for (const attempt of crawlResult.attempts) {
      const [repeatRows] = await connection.query(
        `SELECT COUNT(*) AS count FROM problem
          WHERE user_id = ? AND problem = ? AND verdict = 'accepted'`,
        [userId, attempt.problemId],
      );
      const [result] = await connection.query(
        `INSERT IGNORE INTO problem
          (user_id, name, problem, problem_tier, time, time_text, level,
           repeatation, verdict, external_submission_id, raw_result_text,
           score, runtime_ms, memory_kb, code_length_bytes, language,
           grouped_extra_count)
         VALUES (?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          account.handle,
          attempt.problemId,
          attempt.submittedAt,
          attempt.submittedAtText,
          repeatRows[0].count,
          attempt.verdict,
          attempt.submissionId,
          attempt.rawResult,
          attempt.score,
          attempt.runtimeMs,
          attempt.memoryKb,
          attempt.codeLengthBytes,
          attempt.language,
          attempt.groupedExtraCount,
        ],
      );
      insertedAttemptCount += result.affectedRows;
      const attemptId = BigInt(attempt.submissionId);
      if (attemptId > committedCursor) committedCursor = attemptId;
    }

    await connection.query(
      `UPDATE user
          SET name = ?, corrects = ?, tier = ?,
              submissions = (SELECT COUNT(*) FROM problem WHERE user_id = ?),
              solution = ?, last_rank_seen_at = NOW(3),
              last_submission_synced_at = NOW(3)
        WHERE id = ?`,
      [
        account.handle,
        account.solvedCount,
        account.rating,
        userId,
        committedCursor.toString(),
        userId,
      ],
    );
    await connection.commit();
    return {
      accountId: account.accountId,
      scannedAttemptCount: crawlResult.attempts.length,
      insertedAttemptCount,
      pageCount: crawlResult.pageCount,
      cursorReached: crawlResult.cursorReached,
      committedCursor: committedCursor.toString(),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
