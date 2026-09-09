import { type PoolConnection, createPool } from "mysql2/promise";
import { SeedDatabase } from "../mysql/seed-database.js";

type PreviewUser = Readonly<{
  readonly id: number;
  readonly jungolName: string;
  readonly koreanName: string | null;
  readonly tier: number;
  readonly corrects: number;
  readonly currentAccepted: number;
  readonly totalPoint: number;
}>;

const previewUsers = [
  {
    id: 1001,
    jungolName: "seojun",
    koreanName: "김서준",
    tier: 18,
    corrects: 34,
    currentAccepted: 4,
    totalPoint: 8,
  },
  {
    id: 1002,
    jungolName: "minseo",
    koreanName: "이민서",
    tier: 17,
    corrects: 31,
    currentAccepted: 3,
    totalPoint: 7,
  },
  {
    id: 1003,
    jungolName: "jiho",
    koreanName: "박지호",
    tier: 16,
    corrects: 29,
    currentAccepted: 3,
    totalPoint: 6,
  },
  {
    id: 1004,
    jungolName: "doyoon",
    koreanName: "최도윤",
    tier: 15,
    corrects: 27,
    currentAccepted: 2,
    totalPoint: 5,
  },
  {
    id: 1005,
    jungolName: "haeun",
    koreanName: "정하은",
    tier: 14,
    corrects: 25,
    currentAccepted: 4,
    totalPoint: 7,
  },
  {
    id: 1006,
    jungolName: "junwoo",
    koreanName: "강준우",
    tier: 13,
    corrects: 23,
    currentAccepted: 2,
    totalPoint: 4,
  },
  {
    id: 1007,
    jungolName: "sujin",
    koreanName: "윤수진",
    tier: 12,
    corrects: 21,
    currentAccepted: 3,
    totalPoint: 5,
  },
  {
    id: 1008,
    jungolName: "yuna",
    koreanName: "한유나",
    tier: 11,
    corrects: 19,
    currentAccepted: 2,
    totalPoint: 3,
  },
  {
    id: 1009,
    jungolName: "mason",
    koreanName: null,
    tier: 10,
    corrects: 17,
    currentAccepted: 3,
    totalPoint: 4,
  },
  {
    id: 1010,
    jungolName: "olivia",
    koreanName: null,
    tier: 9,
    corrects: 15,
    currentAccepted: 2,
    totalPoint: 2,
  },
] as const satisfies readonly PreviewUser[];

const previewRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function monthTimestamp(day: number, minute: number): string {
  return `2026-09-${String(day).padStart(2, "0")} ${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
}

async function seedPreview(connection: PoolConnection): Promise<void> {
  await connection.beginTransaction();
  try {
    await connection.execute("UPDATE ranking_boards SET is_active = 0");
    await connection.execute(
      `INSERT INTO user (id, jungol_name, corrects, submissions, solution, korean_name, tier, ac_rating, ignored, jungol_account_id, rank_wrong_count) VALUES ${previewUsers.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)").join(", ")}`,
      previewUsers.flatMap((user, index) => [
        user.id,
        user.jungolName,
        user.corrects,
        user.currentAccepted + 8,
        20_000 + index,
        user.koreanName,
        user.tier,
        1_000 + user.tier * 50,
        30_000 + index,
        index,
      ]),
    );

    const problems = previewUsers.flatMap((user, userIndex) =>
      Array.from({ length: user.currentAccepted }, (_, acceptedIndex) => ({
        id: 10_001 + userIndex * 10 + acceptedIndex,
        userId: user.id,
        problem: 4_000 + userIndex * 10 + acceptedIndex,
        title: `9월 연습 ${userIndex + 1}-${acceptedIndex + 1}`,
        tier: user.tier - acceptedIndex,
        submittedAt: monthTimestamp(
          2 + (userIndex % 7),
          userIndex * 7 + acceptedIndex,
        ),
      })),
    );
    await connection.execute(
      `INSERT INTO problem (id, user_id, problem, problem_name, problem_tier, submitted_at, level, repeatation, verdict, external_submission_id, score) VALUES ${problems.map(() => "(?, ?, ?, ?, ?, ?, ?, 0, 'accepted', ?, ?)").join(", ")}`,
      problems.flatMap((problem, index) => [
        problem.id,
        problem.userId,
        problem.problem,
        problem.title,
        problem.tier,
        problem.submittedAt,
        problem.tier,
        50_001 + index,
        Number((problem.tier + 0.5).toFixed(6)),
      ]),
    );
    await connection.execute(
      `INSERT INTO problem (id, user_id, problem, problem_name, problem_tier, submitted_at, level, repeatation, verdict, external_submission_id, score) VALUES ${previewUsers.map(() => "(?, ?, ?, ?, ?, ?, ?, 0, 'accepted', ?, ?)").join(", ")}`,
      previewUsers.flatMap((user, index) => [
        10_201 + index,
        user.id,
        5_000 + index,
        `8월 복습 ${index + 1}`,
        user.tier,
        `2026-08-${String(12 + (index % 10)).padStart(2, "0")} 11:00:00`,
        user.tier,
        51_001 + index,
        Number((user.tier + 0.25).toFixed(6)),
      ]),
    );

    await connection.execute(
      "INSERT INTO event (id, `begin`, `end`, title, `desc`, created_at) VALUES (1201, '2026-09-01 00:00:00', '2026-10-01 00:00:00', '9월 미니 이벤트', '미리보기용 이벤트', '2026-09-01 00:00:00')",
    );
    await connection.execute(
      `INSERT INTO event_problem (id, event_id, problem, added_at) VALUES ${previewUsers.map((_, index) => "(?, 1201, ?, '2026-09-01 00:00:00')").join(", ")}`,
      previewUsers.flatMap((_, index) => [13_001 + index, 4_000 + index * 10]),
    );

    const dailyScores = previewUsers.map((user, index) => {
      const problem =
        problems[
          index === 0
            ? 0
            : previewUsers
                .slice(0, index)
                .reduce((total, prior) => total + prior.currentAccepted, 0)
        ];
      if (problem === undefined)
        throw new Error("preview daily problem is missing");
      return {
        id: 14_001 + index,
        userId: user.id,
        problemId: problem.id,
        createdAt: problem.submittedAt,
      };
    });
    await connection.execute(
      `INSERT INTO score_history (id, user_id, \`desc\`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES ${dailyScores.map(() => "(?, ?, '일일 해결', 1, 'daily', ?, ?, NULL, ?, ?)").join(", ")}`,
      dailyScores.flatMap((score) => [
        score.id,
        score.userId,
        `daily:${score.userId}:${score.createdAt.slice(0, 10)}`,
        score.createdAt.slice(0, 10),
        score.problemId,
        score.createdAt,
      ]),
    );
    await connection.execute(
      `INSERT INTO score_history (id, user_id, \`desc\`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES ${dailyScores.map(() => "(?, ?, '9월 이벤트', 1, 'event', ?, ?, 1201, ?, ?)").join(", ")}`,
      dailyScores.flatMap((score) => [
        score.id + 100,
        score.userId,
        `event:1201:${score.problemId}`,
        score.createdAt.slice(0, 10),
        score.problemId,
        score.createdAt,
      ]),
    );
    await connection.execute(
      `INSERT INTO score_history (id, user_id, \`desc\`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES ${previewUsers.map(() => "(?, ?, '지난달 일일', 1, 'daily', ?, ?, NULL, ?, ?)").join(", ")}`,
      previewUsers.flatMap((user, index) => [
        14_201 + index,
        user.id,
        `daily:${user.id}:2026-08-${String(12 + (index % 10)).padStart(2, "0")}`,
        `2026-08-${String(12 + (index % 10)).padStart(2, "0")}`,
        10_201 + index,
        `2026-08-${String(12 + (index % 10)).padStart(2, "0")} 11:00:00`,
      ]),
    );
    await connection.execute(
      `INSERT INTO score_history (id, user_id, \`desc\`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at) VALUES ${previewUsers.map(() => "(?, ?, '미리보기 보너스', ?, 'manual', NULL, NULL, NULL, NULL, '2026-09-08 20:00:00')").join(", ")}`,
      previewUsers.flatMap((user, index) => [
        14_301 + index,
        user.id,
        user.totalPoint - 2,
      ]),
    );

    await connection.execute(
      "INSERT INTO ranking_boards (id, title, created_at, is_active) VALUES (1501, '8월 첫째 주', '2026-08-08 00:00:00', 0), (1502, '8월 마지막 주', '2026-08-29 00:00:00', 0), (1503, '9월 첫째 주', '2026-09-02 00:00:00', 0), (1504, '9월 둘째 주', '2026-09-08 12:00:00', 0), (1505, '9월 현재 보드', '2026-09-09 00:00:00', 1)",
    );
    const boardRanks = [
      [2, 1, ...previewUsers.map((user) => user.id).slice(0, 8)],
      [1, ...previewUsers.map((user) => user.id).slice(0, 8), 2],
      [...previewUsers.map((user) => user.id).slice(2, 10), 1, 2],
      [1005, 1001, 1003, 1, 1002, 1007, 1004, 2, 1006, 1008],
      [1001, 1, 1002, 1005, 1003, 2, 1004, 1007, 1006, 1008],
    ] as const;
    await connection.execute(
      `INSERT INTO ranked_users (id, board_id, \`rank\`, user_id) VALUES ${boardRanks.flatMap((board) => board.map(() => "(?, ?, ?, ?)")).join(", ")}`,
      boardRanks.flatMap((board, boardIndex) =>
        board.flatMap((userId, rankIndex) => [
          16_001 + boardIndex * 10 + rankIndex,
          1501 + boardIndex,
          previewRanks[rankIndex],
          userId,
        ]),
      ),
    );
    await connection.execute(
      `INSERT INTO user_bias_total (user_id, total_point, updated_at) VALUES ${previewUsers.map(() => "(?, ?, '2026-09-09 00:00:00')").join(", ")}`,
      previewUsers.flatMap((user) => [user.id, user.totalPoint]),
    );
    await connection.commit();
  } catch (error: unknown) {
    await connection.rollback();
    throw error;
  }
}

const pool = createPool({
  host: process.env.DB_HOST ?? "anabada-mysql",
  port: Number(process.env.DB_PORT ?? "3306"),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "jungol_bada",
  waitForConnections: true,
  connectionLimit: 1,
});

try {
  await new SeedDatabase(pool).resetAndSeed();
  const connection = await pool.getConnection();
  try {
    await seedPreview(connection);
  } finally {
    connection.release();
  }
} finally {
  await pool.end();
}
