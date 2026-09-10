SET time_zone = '+00:00';
-- KST 월 경계는 date로 먼저 확정한 뒤 UTC로 변환해 월말·월초 캐시 혼입을 막는다.
SET @kst_now = UTC_TIMESTAMP() + INTERVAL 9 HOUR;
SET @current_score_month = DATE_FORMAT(@kst_now, '%Y-%m-01');
SET @previous_score_month = DATE_SUB(@current_score_month, INTERVAL 1 MONTH);
SET @current_month_utc = DATE_SUB(@current_score_month, INTERVAL 9 HOUR);
SET @previous_month_utc = DATE_SUB(@previous_score_month, INTERVAL 9 HOUR);
SET @next_month_utc = DATE_SUB(DATE_ADD(@current_score_month, INTERVAL 1 MONTH), INTERVAL 9 HOUR);
START TRANSACTION;

-- demo 고정 ID UPSERT는 재실행에서 동일 행을 갱신하고, 다른 데이터를 삭제하지 않는다.
INSERT INTO user (id, jungol_name, corrects, submissions, solution, korean_name, tier, ac_rating, ignored, jungol_account_id, rank_wrong_count, initialized_at, initial_submission_id)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 30)
SELECT 80000 + value, CONCAT('demo', LPAD(value, 2, '0')), 0, 0, 990000 + value,
  ELT(value, '김서준', '이민서', '박지호', '최도윤', '정하은', '강준우', '윤수진', '한유나', '김민재', '이서연', '박준혁', '최유진', '정민준', '강지민', '윤도현', '한서윤', '김도현', '이채원', '박시우', '최하린', '정지훈', '강예린', '윤현우', '한지민', '김주원', '이도윤', '박서아', '최민석', '정유나', '강하준'),
  31 - value, ELT(31 - value, 30, 60, 90, 120, 150, 200, 300, 400, 500, 650, 800, 950, 1100, 1250, 1400, 1600, 1750, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2850, 2900, 2950), 0, 880000 + value, value % 6,
  UTC_TIMESTAMP(), 990000 + value
FROM n
ON DUPLICATE KEY UPDATE jungol_name=VALUES(jungol_name), korean_name=VALUES(korean_name), tier=VALUES(tier), ac_rating=VALUES(ac_rating), ignored=0, rank_wrong_count=VALUES(rank_wrong_count), initialized_at=VALUES(initialized_at), initial_submission_id=VALUES(initial_submission_id);

INSERT INTO problem (id, user_id, problem, problem_name, problem_tier, submitted_at, level, repeatation, verdict, external_submission_id, score, estimated_tier)
WITH RECURSIVE users AS (SELECT 1 AS user_no UNION ALL SELECT user_no + 1 FROM users WHERE user_no < 30), submissions AS (SELECT 1 AS submission_no UNION ALL SELECT submission_no + 1 FROM submissions WHERE submission_no < 6)
SELECT 910000 + users.user_no * 10 + submissions.submission_no, 80000 + users.user_no,
  4000 + users.user_no * 10 + CASE WHEN submissions.submission_no = 6 THEN 1 ELSE submissions.submission_no END,
  CONCAT('데모 알고리즘 ', users.user_no, '-', CASE WHEN submissions.submission_no = 6 THEN 1 ELSE submissions.submission_no END),
  LEAST(31, 34 - users.user_no), CASE submissions.submission_no
    WHEN 1 THEN UTC_TIMESTAMP() - INTERVAL (1 + users.user_no % 5) DAY
    WHEN 2 THEN @previous_month_utc + INTERVAL (8 + users.user_no % 10) DAY
    WHEN 3 THEN UTC_TIMESTAMP() - INTERVAL (1 + users.user_no % 6) DAY
    WHEN 4 THEN @previous_month_utc + INTERVAL (15 + users.user_no % 8) DAY
    WHEN 5 THEN UTC_TIMESTAMP() - INTERVAL (2 + users.user_no % 7) DAY
    ELSE UTC_TIMESTAMP() - INTERVAL (1 + users.user_no % 5) DAY + INTERVAL 30 MINUTE END,
  LEAST(31, 34 - users.user_no) - (31 - users.user_no), CASE WHEN submissions.submission_no = 6 THEN 1 ELSE 0 END, 'accepted',
  9900000 + users.user_no * 10 + submissions.submission_no, 80.000000 + users.user_no, LEAST(31, 34 - users.user_no)
FROM users CROSS JOIN submissions WHERE TRUE
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), problem=VALUES(problem), problem_name=VALUES(problem_name), problem_tier=VALUES(problem_tier), submitted_at=VALUES(submitted_at), level=VALUES(level), repeatation=VALUES(repeatation), verdict='accepted', score=VALUES(score), estimated_tier=VALUES(estimated_tier);

UPDATE user u
SET corrects=(SELECT COUNT(DISTINCT p.problem) FROM problem p WHERE p.user_id=u.id AND p.verdict='accepted'),
    submissions=(SELECT COUNT(*) FROM problem p WHERE p.user_id=u.id AND p.verdict='accepted'),
    solution=(SELECT MAX(p.external_submission_id) FROM problem p WHERE p.user_id=u.id AND p.verdict='accepted')
WHERE u.id BETWEEN 80001 AND 80030;

INSERT INTO event (id, `begin`, `end`, title, `desc`, created_at) VALUES
  (9001, UTC_TIMESTAMP() - INTERVAL 20 DAY, UTC_TIMESTAMP() - INTERVAL 10 DAY, '지난 데모 이벤트', '종료된 이벤트', UTC_TIMESTAMP() - INTERVAL 21 DAY),
  (9002, UTC_TIMESTAMP() - INTERVAL 7 DAY, UTC_TIMESTAMP() + INTERVAL 6 DAY, '진행 중 데모 이벤트', '현재 표시되는 문제 칩', UTC_TIMESTAMP() - INTERVAL 8 DAY),
  (9003, UTC_TIMESTAMP() + INTERVAL 10 DAY, UTC_TIMESTAMP() + INTERVAL 20 DAY, '예정 데모 이벤트', '예정된 이벤트', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE `begin`=VALUES(`begin`), `end`=VALUES(`end`), title=VALUES(title), `desc`=VALUES(`desc`), created_at=VALUES(created_at);

INSERT INTO event_problem (id, event_id, problem, added_at) VALUES
  (92001, 9001, 4011, UTC_TIMESTAMP() - INTERVAL 21 DAY), (92002, 9001, 4021, UTC_TIMESTAMP() - INTERVAL 21 DAY), (92003, 9001, 4031, UTC_TIMESTAMP() - INTERVAL 21 DAY), (92004, 9001, 4041, UTC_TIMESTAMP() - INTERVAL 21 DAY), (92005, 9001, 4051, UTC_TIMESTAMP() - INTERVAL 21 DAY),
  (92011, 9002, 4011, UTC_TIMESTAMP() - INTERVAL 8 DAY), (92012, 9002, 4021, UTC_TIMESTAMP() - INTERVAL 8 DAY), (92013, 9002, 4031, UTC_TIMESTAMP() - INTERVAL 8 DAY), (92014, 9002, 4041, UTC_TIMESTAMP() - INTERVAL 8 DAY), (92015, 9002, 4051, UTC_TIMESTAMP() - INTERVAL 8 DAY),
  (92021, 9003, 4011, UTC_TIMESTAMP()), (92022, 9003, 4021, UTC_TIMESTAMP()), (92023, 9003, 4031, UTC_TIMESTAMP()), (92024, 9003, 4041, UTC_TIMESTAMP()), (92025, 9003, 4051, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE event_id=VALUES(event_id), problem=VALUES(problem), added_at=VALUES(added_at);

-- 원장은 실제 문제 행을 다시 참조해 KST 점수일·시각·멱등 키를 항상 일치시킨다.
INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 30)
SELECT 93000 + n.value, p.user_id, CONCAT('#', p.problem, '를 해결하여, 일일 점수 획득'), 1, 'daily',
  CONCAT('daily:', p.user_id, ':', DATE(p.submitted_at + INTERVAL 9 HOUR)), DATE(p.submitted_at + INTERVAL 9 HOUR), NULL, p.id, p.submitted_at
FROM n JOIN problem p ON p.id=910000 + n.value * 10 + 1
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), `desc`=VALUES(`desc`), bias=1, award_key=VALUES(award_key), score_day=VALUES(score_day), problem_id=VALUES(problem_id), created_at=VALUES(created_at);

INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 5)
SELECT 93100 + n.value, p.user_id, '이벤트 ID #event9002 문제를 풀어 점수 획득', 1, 'event',
  CONCAT('event:9002:', p.user_id, ':', p.problem), DATE(p.submitted_at + INTERVAL 9 HOUR), 9002, p.id, p.submitted_at
FROM n JOIN problem p ON p.id=910000 + n.value * 10 + 1
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), `desc`=VALUES(`desc`), bias=1, award_key=VALUES(award_key), score_day=VALUES(score_day), event_id=9002, problem_id=VALUES(problem_id), created_at=VALUES(created_at);

INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 30)
SELECT 93200 + value, 80000 + value, IF(value % 7 = 0, '데모 수동 감점', '데모 수동 보정'), IF(value % 7 = 0, -2, 2 + value % 3), 'manual', NULL, NULL, NULL, NULL, UTC_TIMESTAMP()
FROM n
ON DUPLICATE KEY UPDATE `desc`=VALUES(`desc`), bias=VALUES(bias), created_at=VALUES(created_at);

INSERT INTO score_history (id, user_id, `desc`, bias, rule_type, award_key, score_day, event_id, problem_id, created_at)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 10)
SELECT 93300 + n.value, p.user_id, CONCAT('#', p.problem, '를 해결하여, 일일 점수 획득'), 1, 'daily',
  CONCAT('daily:', p.user_id, ':', DATE(p.submitted_at + INTERVAL 9 HOUR)), DATE(p.submitted_at + INTERVAL 9 HOUR), NULL, p.id, p.submitted_at
FROM n JOIN problem p ON p.id=910000 + n.value * 10 + 2
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), `desc`=VALUES(`desc`), bias=1, award_key=VALUES(award_key), score_day=VALUES(score_day), problem_id=VALUES(problem_id), created_at=VALUES(created_at);

INSERT INTO user_bias_total (user_id, score_month, total_point, updated_at)
SELECT u.id, @current_score_month, COALESCE(SUM(sh.bias), 0), UTC_TIMESTAMP()
FROM user u LEFT JOIN score_history sh ON sh.user_id=u.id AND sh.created_at >= @current_month_utc AND sh.created_at < @next_month_utc
WHERE u.id BETWEEN 80001 AND 80030 GROUP BY u.id
ON DUPLICATE KEY UPDATE score_month=VALUES(score_month), total_point=VALUES(total_point), updated_at=VALUES(updated_at);

-- 지난달 두 보드와 현재 KST 월 보드를 함께 남겨 순위 변화와 최신 보드를 보여 준다.
INSERT INTO ranking_boards (id, title, created_at, is_active)
WITH RECURSIVE n AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM n WHERE value < 7)
SELECT 94000 + value, CONCAT('데모 순위 보드 ', value), CASE value WHEN 1 THEN @previous_month_utc + INTERVAL 8 DAY WHEN 2 THEN @previous_month_utc + INTERVAL 18 DAY ELSE DATE_ADD(GREATEST(@current_month_utc, UTC_TIMESTAMP() - INTERVAL (8 - value) DAY), INTERVAL value SECOND) END, IF(value = 7, 1, 0) FROM n
ON DUPLICATE KEY UPDATE title=VALUES(title), created_at=VALUES(created_at), is_active=VALUES(is_active);

INSERT INTO ranked_users (id, board_id, `rank`, user_id)
WITH RECURSIVE boards AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM boards WHERE value < 7), users AS (SELECT 1 AS value UNION ALL SELECT value + 1 FROM users WHERE value < 30)
SELECT 950000 + boards.value * 100 + users.value, 94000 + boards.value, ((users.value + boards.value * 3 - 2) % 30) + 1, 80000 + users.value
FROM boards CROSS JOIN users WHERE TRUE
ON DUPLICATE KEY UPDATE `rank`=VALUES(`rank`), user_id=VALUES(user_id);
COMMIT;
