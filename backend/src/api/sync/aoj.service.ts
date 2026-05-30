import { getDatabase } from "../../db/database.js";
import { logger } from "../../index.js";

const AOJ_API_URL = "https://aoj.anacnu.kr/api/v1/public";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * AOJ API 서버로 HTTP GET 요청을 보내는 공통 함수 (429 에러 방지용 재시도 로직 포함)
 */
async function fetchFromAOJ(endpoint: string, retries = 2): Promise<any> {
  const API_TOKEN = process.env.AOJ_API || "";
  const response = await fetch(`${AOJ_API_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });

  if (response.status === 429 && retries > 0) {
    logger.warn(
      `AOJ API Rate Limited (429) for ${endpoint}. Retrying in 5 seconds...`,
    );
    await delay(5000);
    return fetchFromAOJ(endpoint, retries - 1);
  }

  if (!response.ok) {
    throw new Error(`AOJ API Error: ${response.status} ${response.statusText}`);
  }

  // 요청 간 기본 딜레이 (너무 잦은 요청 방지)
  await delay(100);

  return response.json();
}

/**
 * AOJ의 Rating 시스템을 기존 백준 티어(1~30) 시스템으로 변환
 */
function convertRatingToTier(rating: number): number {
  if (!rating || rating < 0) return 0;
  const tier = Math.floor(rating / 100) + 1;
  return tier > 31 ? 31 : tier;
}

/**
 * Step 1: 유저 동기화
 */
export async function syncUsers() {
  const db = getDatabase();
  let page = 1;
  const limit = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      const data = await fetchFromAOJ(`/users?limit=${limit}&page=${page}`);
      const users = data.users;

      if (!users || users.length === 0) break;

      for (const u of users) {
        const convertedTier = convertRatingToTier(u.rating);

        const safeUsername = u.username
          ? u.username.substring(0, 50)
          : "unknown";
        const safeName = u.name ? u.name.substring(0, 25) : null;

        await db.query(
          `
          INSERT INTO user (name, kr_name, tier, corrects, submissions, solution, ignored) 
          VALUES (?, ?, ?, 0, 0, 0, 1) 
          ON DUPLICATE KEY UPDATE 
            kr_name = VALUES(kr_name), 
            tier = VALUES(tier)
        `,
          [safeUsername, safeName, convertedTier],
        );
      }

      if (users.length < limit) hasMore = false;
      page++;
    }
  } catch (e: any) {
    logger.warn(`Failed to sync users (Rate Limit or Network): ${e.message}`);
    // 유저 목록 동기화에 실패해도, 기존 등록된 유저들의 문제 풀이 기록 동기화(syncSubmissions)는 진행하도록 예외를 먹습니다.
  }
  logger.info("User sync completed.");
}

/**
 * 특정 문제의 티어 정보를 AOJ API에서 가져옵니다. (DB 우선 확인)
 */
async function getProblemTier(problemId: number): Promise<number> {
  const db = getDatabase();
  try {
    // 1. DB에 이미 해당 문제의 티어 정보가 있는지 확인
    const [existing]: any = await db.query(
      `SELECT problem_tier FROM problem WHERE problem = ? LIMIT 1`,
      [problemId],
    );
    if (existing && existing.length > 0) {
      return existing[0].problem_tier;
    }

    // 2. DB에 없다면 AOJ API 호출 (최대 2번 재시도)
    const data = await fetchFromAOJ(`/problems/${problemId}`, 2);
    return data.tier || 0;
  } catch (e: any) {
    if (e.message && e.message.includes("404")) {
      logger.warn(
        `Problem ${problemId} not found on AOJ API (404). Defaulting tier to 0.`,
      );
      return 0;
    }
    logger.error(
      `Failed to fetch problem ${problemId} tier due to API/Network error. Aborting to prevent tier 0 corruption.`,
    );
    throw e; // 트랜잭션 롤백을 위해 에러를 던짐
  }
}

/**
 * Step 2: 제출 기록 동기화 및 포인트(Event/Daily) 지급
 */
export async function syncSubmissions() {
  const db = getDatabase();
  const [users]: any = await db.query(
    "SELECT id, name, tier FROM user WHERE ignored = 0",
  );

  for (const user of users) {
    try {
      // [Broad Search] 각 유저의 가장 최근 제출 1건 탐색
      const latestData = await fetchFromAOJ(
        `/submissions?username=${user.name}&limit=1`,
        2,
      );
      if (!latestData.submissions || latestData.submissions.length === 0)
        continue;

      const latestSub = latestData.submissions[0];

      // 최근 제출한 문제의 problemId를 user 테이블의 solution 컬럼에 업데이트
      await db.query(
        'UPDATE user SET solution = ? WHERE id = ?',
        [latestSub.problemId, user.id]
      );

      const subDate = new Date(latestSub.createdAt);
      const minTime = new Date(subDate.getTime() - 1000);
      const maxTime = new Date(subDate.getTime() + 1000);

      const [existingCheck]: any = await db.query(
        'SELECT id FROM problem WHERE name = ? AND problem = ? AND time BETWEEN ? AND ?',
        [user.name, latestSub.problemId, minTime, maxTime]
      );

      if (existingCheck.length > 0) continue;

      // [Deep Search] 모르는 기록 긁어오기
      let page = 1;
      let fetching = true;
      const newSubmissions = [];

      while (fetching) {
        const data = await fetchFromAOJ(
          `/submissions?username=${user.name}&limit=10&page=${page}`,
          2,
        );
        const subs = data.submissions;
        if (!subs || subs.length === 0) break;

        for (const sub of subs) {
          const subDate = new Date(sub.createdAt);
          const minTime = new Date(subDate.getTime() - 1000);
          const maxTime = new Date(subDate.getTime() + 1000);

          const [check]: any = await db.query(
            'SELECT id FROM problem WHERE name = ? AND problem = ? AND time BETWEEN ? AND ?',
            [user.name, sub.problemId, minTime, maxTime]
          );
          
          if (check.length > 0) {
            fetching = false;
            break;
          }

          newSubmissions.push(sub);
        }
        if (subs.length < 20) fetching = false;
        page++;
      }

      newSubmissions.reverse();

      // 긁어온 "새로운 정답 기록"들 DB 저장 및 포인트 규칙 (원자성 보장을 위해 트랜잭션 사용)
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        for (const sub of newSubmissions) {
          const pTier = await getProblemTier(sub.problemId);
          const subDate = new Date(sub.createdAt);

          // 유저가 이 문제를 예전에 푼 적이 있는지 (repeatation) 계산 - 'accepted' 기준
          const [repeatCountRes]: any = await connection.query(
            `
            SELECT COUNT(*) as count FROM problem WHERE name = ? AND problem = ? AND verdict = 'accepted'
          `,
            [user.name, sub.problemId],
          );

          const repeatation = repeatCountRes[0].count; // 이전에 푼 횟수 (0이면 처음 푼 것)
          const isSolvedBefore = repeatation > 0;

          // 1. problem 테이블에 제출 기록 먼저 저장 (오답도 전부 저장)
          const [insertRes]: any = await connection.query(
            `
            INSERT INTO problem (name, problem, problem_tier, time, level, repeatation, verdict)
            VALUES (?, ?, ?, ?, 0, ?, ?)
          `,
            [
              user.name,
              sub.problemId,
              pTier,
              subDate,
              repeatation,
              sub.verdict,
            ],
          );

          const newProblemId = insertRes.insertId;

          // 전체 제출 횟수(submissions) 1 증가
          await connection.query('UPDATE user SET submissions = submissions + 1 WHERE id = ?', [user.id]);

          // 오답이거나, 이미 예전에 푼 적 있는 문제라면 어떠한 포인트도 지급하지 않고 건너뜀
          if (sub.verdict !== "accepted" || isSolvedBefore) {
            if (sub.verdict === "accepted" && isSolvedBefore) {
              logger.info(
                `User ${user.name} already solved problem ${sub.problemId} before (repeatation: ${repeatation}). No points awarded.`,
              );
            }
            continue;
          }

          // 처음으로 맞춘 문제인 경우 정답 횟수(corrects) 1 증가
          await connection.query('UPDATE user SET corrects = corrects + 1 WHERE id = ?', [user.id]);

          // ----------------------------------------------------
          // 1. 일일 기본 포인트 검사 로직
          // 오늘 '일반 포인트(event_id가 NULL)'를 받은 적이 있는지 확인
          const [todayScoreCheck]: any = await connection.query(
            `
            SELECT id FROM score_history 
            WHERE user_id = ? 
            AND event_id IS NULL 
            AND DATE(created_at) = DATE(?)
            LIMIT 1
          `,
            [user.id, subDate],
          );

          const hasScoreToday = todayScoreCheck.length > 0;

          if (
            !hasScoreToday &&
            (pTier === 0 || pTier >= user.tier - 5 || pTier >= 11)
          ) {
            await connection.query(
              `
              INSERT INTO score_history (user_id, \`desc\`, bias, problem_id, created_at)
              VALUES (?, ?, ?, ?, ?)
            `,
              [
                user.id,
                `AOJ Daily First Solve: Problem ${sub.problemId}`,
                1,
                newProblemId,
                subDate,
              ],
            );
            logger.info(
              `User ${user.name} earned +1 Daily point for problem ${sub.problemId}`,
            );
          }

          // ----------------------------------------------------
          // 2. 이벤트 포인트 검사 로직
          // 풀이 시간(subDate) 기준 진행 중인 이벤트 목록 조회
          const [ongoingEvents]: any = await connection.query(
            `
            SELECT id FROM event 
            WHERE begin <= ? AND end >= ?
          `,
            [subDate, subDate],
          );

          for (const event of ongoingEvents) {
            // 이 문제가 해당 이벤트의 지정 문제인지 확인
            const [isEventProblem]: any = await connection.query(
              `
              SELECT problem FROM event_problem 
              WHERE event_id = ? AND problem = ?
            `,
              [event.id, sub.problemId],
            );

            if (isEventProblem.length > 0) {
              // 해당 이벤트에서 이 "문제 번호"로 점수를 이미 받았는지 중복 검사
              const [alreadyGotEventScore]: any = await connection.query(
                `
                SELECT sh.id 
                FROM score_history sh
                JOIN problem p ON sh.problem_id = p.id
                WHERE sh.user_id = ? 
                AND sh.event_id = ? 
                AND p.problem = ?
              `,
                [user.id, event.id, sub.problemId],
              );

              // 받은 적이 없다면 추가 포인트(+1) 지급
              if (alreadyGotEventScore.length === 0) {
                await connection.query(
                  `
                  INSERT INTO score_history (user_id, \`desc\`, bias, event_id, problem_id, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                `,
                  [
                    user.id,
                    `Event(#${event.id})의 ${sub.problemId}번 문제 해결`,
                    1,
                    event.id,
                    newProblemId,
                    subDate,
                  ],
                );
                logger.info(
                  `User ${user.name} earned +1 Event point for problem ${sub.problemId} in Event #${event.id}`,
                );
              }
            }
          }
        }
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (e: any) {
      logger.warn(
        `Failed to sync submissions for user ${user.name}: ${e.message}`,
      );
      // 해당 유저에서 에러가 발생해도 다른 유저는 계속 처리하도록 진행합니다.
    }
  }
  logger.info("Submissions sync completed.");
}

/**
 * Step 3: 이번 달 유저 총점 최신화 (Bias Update)
 */
export async function updateBiasTotal() {
  const db = getDatabase();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [scoreHistory]: any = await db.query(
    `
    SELECT user_id, SUM(bias) as total_bias 
    FROM score_history 
    WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
    GROUP BY user_id
  `,
    [currentMonth, currentYear],
  );

  await db.query(`DELETE FROM user_bias_total`);

  for (const record of scoreHistory) {
    await db.query(
      `
      INSERT INTO user_bias_total (user_id, total_point)
      VALUES (?, ?)
    `,
      [record.user_id, record.total_bias],
    );
  }
  logger.info("Bias Total (Monthly Scores) updated.");
}

// 간단한 시드 기반 난수 생성기 (결정론적 셔플용)
function mulberry32(a: number) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 문자열을 숫자로 변환하는 해시 함수
function stringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h;
}

/**
 * Step 4: 랭킹 스냅샷 생성 및 셔플 알고리즘
 */
export async function updateRankingBoard() {
  const db = getDatabase();

  const [users]: any = await db.query(`
    SELECT u.id as user_id, u.name, COALESCE(ub.total_point, 0) as score
    FROM user u
    LEFT JOIN user_bias_total ub ON u.id = ub.user_id
    WHERE u.ignored = 0 AND COALESCE(ub.total_point, 0) > 0
    ORDER BY u.id ASC
  `);

  if (users.length === 0) return;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let totalScore = 0;

  const weightedUsers: { user_id: number; name: string; score: number }[] = [];

  for (const u of users) {
    totalScore += u.score;
    const weight = Math.floor(Math.pow(u.score, 1.05));
    for (let i = 0; i < weight; i++) {
      weightedUsers.push(u);
    }
  }

  const seedString = `${process.env.RANDOM_SEED || "anabada"}-${year * 100 + month}-${totalScore}`;
  const randomFunc = mulberry32(stringToSeed(seedString));

  for (let i = weightedUsers.length - 1; i > 0; i--) {
    const j = Math.floor(randomFunc() * (i + 1));
    [weightedUsers[i], weightedUsers[j]] = [weightedUsers[j], weightedUsers[i]];
  }

  const finalRanking = [];
  const seen = new Set();
  for (const u of weightedUsers) {
    if (!seen.has(u.user_id)) {
      seen.add(u.user_id);
      finalRanking.push(u);
    }
  }

  const [latestBoard]: any = await db.query(
    `SELECT id FROM ranking_boards ORDER BY id DESC LIMIT 1`,
  );
  if (latestBoard.length > 0) {
    const boardId = latestBoard[0].id;
    const [latestUsers]: any = await db.query(
      `SELECT user_id FROM ranked_users WHERE board_id = ? ORDER BY \`rank\` ASC`,
      [boardId],
    );
    const latestOrder = latestUsers.map((r: any) => r.user_id).join(",");
    const newOrder = finalRanking.map((u) => u.user_id).join(",");

    if (latestOrder === newOrder) {
      logger.info("Ranking has not changed. Skipping snapshot.");
      return;
    }
  }

  const boardTitle = `${year}년 ${month}월 랭킹`;

  const [boardRes]: any = await db.query(
    `
    INSERT INTO ranking_boards (title) VALUES (?)
  `,
    [boardTitle],
  );
  const newBoardId = boardRes.insertId;

  let currentRank = 1;
  for (const u of finalRanking) {
    await db.query(
      `
      INSERT INTO ranked_users (board_id, \`rank\`, user_id)
      VALUES (?, ?, ?)
    `,
      [newBoardId, currentRank, u.user_id],
    );
    currentRank++;
  }

  logger.info(`Ranking Board snapshot created (ID: ${newBoardId}).`);
}

/**
 * 전체 동기화 사이클
 */
export async function runFullSyncCycle() {
  logger.info("Starting full AOJ sync cycle...");
  await syncUsers(); // 1. 유저 동기화
  await syncSubmissions(); // 2. 제출 기록 및 일일/이벤트 포인트 동기화
  await updateBiasTotal(); // 3. 월간 누적 포인트 업데이트
  await updateRankingBoard(); // 4. 랭킹 보드 스냅샷 (결정론적 난수 셔플 기반)
  logger.info("Full AOJ sync cycle finished.");
}
