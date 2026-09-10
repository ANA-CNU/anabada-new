USE `jungol_bada`;
SET SESSION time_zone = '+00:00';

-- 운영 실행 전 백업이 필요하다. 003 이전의 자동 생성 데이터는 새 기준선 투영을 위해 reset하며, MySQL DDL의 implicit commit 때문에 이 마이그레이션 전체를 rollback할 수 없다.
-- 따라서 DDL은 아래 reset DML과 의도적으로 분리한다.
ALTER TABLE `user`
  -- 프로필별 기준선(과거 AC를 소급 집계하지 않는 출발점) 확정 시각이다. 전역 체크포인트와 달리 사용자별 초기화 완료 여부를 판별한다.
  ADD COLUMN `initialized_at` datetime(3) NULL,
  -- 신규 프로필의 기준선에서 확정한 마지막 외부 제출 ID다. 이 ID 이하는 일반/이벤트 점수를 지급하지 않는 feed head 경계이며, 실제 반영 완료 ID인 `user.solution`과 분리한다.
  ADD COLUMN `initial_submission_id` bigint unsigned NULL;

ALTER TABLE `problem`
  -- 원본 문제의 실제 난이도와 별도로 둘 추정 난이도용 칼럼이다. 현재 ProblemTierEstimator는 0을 반환하는 임시 구현이며 AI 호출은 없다. 반환값을 저장해 점수 판정에 사용한다.
  ADD COLUMN `estimated_tier` int NOT NULL DEFAULT 0,
  ADD CONSTRAINT `chk_problem_estimated_tier` CHECK (`estimated_tier` BETWEEN 0 AND 31);

ALTER TABLE `user_bias_total`
  -- 합계가 귀속되는 KST 월의 첫날이다. 월별 합계를 서로 섞지 않고 조회·재집계할 수 있는 구분 키다.
  ADD COLUMN `score_month` date NULL;

UPDATE `user_bias_total`
SET `score_month` = DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 9 HOUR, '%Y-%m-01');

ALTER TABLE `user_bias_total`
  MODIFY COLUMN `score_month` date NOT NULL;

-- `collector_checkpoint`는 그룹 단위 수집 진행도를 보관한다. 사용자별 마지막 반영 제출 번호인 `user.solution`이 아니라, 공유 feed를 한 번만 안정적으로 읽기 위한 작업 상태다.
CREATE TABLE `collector_checkpoint` (
  `group_id` bigint unsigned NOT NULL,
  -- 정산까지 끝나 확정된 수집 경계다. 최초 부트스트랩에서는 과거를 소급하지 않기 위해 H0로 초기화하며, 이후 구간도 정산 완료 뒤에만 전진한다.
  `committed_cursor` bigint unsigned NOT NULL DEFAULT 0,
  -- 현재 수집 창을 시작할 때 고정한 최신 제출 ID다. 페이지를 넘기는 동안 새 유입이 있어도 이번 창의 상한이 변하지 않는다.
  `window_upper_submission_id` bigint unsigned NULL,
  -- 이번 창에서 처리할 이전 확정 경계다. 상한·하한을 함께 고정해 페이지 재시도와 중간 유입에도 같은 구간을 정산한다.
  `window_lower_cursor` bigint unsigned NULL,
  -- 외부 feed의 다음 페이지 토큰이다. 제출 ID 경계와 달리 API 페이지 순회를 재개하기 위한 일시 상태다.
  `pagination_cursor` text NULL,
  -- 다음 페이지를 ID 내림차순으로 순회할 때 마지막으로 스캔한 제출 ID다. 페이지 순서·커서 진행을 검사하는 값이며, 정산 확정 경계 자체는 아니다.
  `last_scanned_submission_id` bigint unsigned NULL,
  -- `idle`은 대기, `collecting`은 고정 창의 페이지 수집, `settling`은 inbox 반영·확정 직전 단계다. 재시작 시 어떤 작업을 복구할지 결정한다.
  `phase` varchar(16) NOT NULL DEFAULT 'idle',
  -- `cursor`보다 오래된 AC 10행을 재탐색한 건수다. 하한 근처의 older-10 중첩 탐색이 실제로 수행됐는지 기록한다.
  `overlap_observed_count` int unsigned NOT NULL DEFAULT 0,
  -- 고정 하한과 10행 overlap까지 확인했거나 API가 `more=false`인 끝 페이지에 도달했음을 표시한다. true여야 수집 창 전체를 봤다고 판단해 정산으로 넘어간다.
  `cursor_reached` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`group_id`),
  CONSTRAINT `chk_collector_checkpoint_phase` CHECK (`phase` IN ('idle','collecting','settling'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- `collector_ac_inbox`는 외부 AC 관측을 정산 전까지 내구성 있게 보관하는 inbox다. 장애·재시도 중에도 pending 항목을 잃지 않으며, 반영 완료 시 사용자 트랜잭션 안에서 삭제한다.
CREATE TABLE `collector_ac_inbox` (
  -- 제출 ID가 기본 키이므로 중복 수집은 한 번의 pending 레코드로 합쳐진다.
  `external_submission_id` bigint unsigned NOT NULL,
  -- 공유 feed를 소비한 대상 그룹이다. 같은 외부 제출을 어느 그룹 정산에 투영할지 식별한다.
  `group_id` bigint unsigned NOT NULL,
  -- 외부 Jungol 계정 식별자다. 내부 사용자 매핑과 그룹별 반영 대상을 찾는 키다.
  `jungol_account_id` bigint unsigned NOT NULL,
  -- 제출한 문제 번호다. 최초 풀이/반복 풀이를 판별하고, 문제 metadata 및 이후 estimator가 참조하는 식별자다.
  `problem` int unsigned NOT NULL,
  -- 외부 제출 시각이다. 일별 집계 및 시간 기준 규칙의 원본 시점으로 남긴다.
  `submitted_at` datetime(3) NOT NULL,
  -- Jungol이 해당 제출에 부여한 채점 점수다. 우리 서비스의 daily/event bias나 내부 가산점이 아니다.
  `score` decimal(10,6) NULL,
  PRIMARY KEY (`external_submission_id`),
  KEY `idx_collector_inbox_group_account_submission` (`group_id`,`jungol_account_id`,`external_submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 승인된 reset: DDL은 implicit commit이므로 먼저 끝낸 뒤 DML을 트랜잭션으로 묶는다. 자동 수집·투영 상태만 비우고 수동 점수와 운영 설정은 보존한다.
SET @score_month = DATE_FORMAT(UTC_TIMESTAMP() + INTERVAL 9 HOUR, '%Y-%m-01');
START TRANSACTION;
-- daily/event 자동 이력만 삭제한다. manual 이력은 월별 baseline 합계의 근거이므로 보존한다.
DELETE FROM `score_history` WHERE `rule_type` IN ('daily','event');
-- AC 관측에서 파생된 문제·랭킹·월 합계와 수집 작업 상태를 삭제해 새 기준선으로 다시 투영한다. manual 이력의 문제 FK는 `SET NULL`이므로 문제 삭제 뒤에도 수동 점수 자체는 보존된다.
DELETE FROM `problem`;
DELETE FROM `ranked_users`;
DELETE FROM `ranking_boards`;
DELETE FROM `user_bias_total`;
-- 아직 반영되지 않은 inbox도 삭제한다. 이후 사용자별 AC 반영 트랜잭션은 처리 성공한 pending 행을 함께 삭제하는 방식이다.
DELETE FROM `collector_ac_inbox`;
DELETE FROM `collector_checkpoint`;
-- 사용자 자동 집계값과 기준선만 초기화한다. 수동 점수·사용자 기본 정보·이벤트/훅 설정·다른 DB 데이터는 이 마이그레이션이 삭제하지 않는다.
UPDATE `user` SET `corrects`=0, `submissions`=0, `solution`=0, `initialized_at`=NULL, `initial_submission_id`=NULL;

-- 보존한 manual 이력에서 이번 KST 월 baseline만 다시 만든다. 시간 범위를 UTC로 환산해 월 경계의 오집계를 막는다.
INSERT INTO `user_bias_total` (`user_id`,`score_month`,`total_point`)
SELECT `user_id`, @score_month, COALESCE(SUM(`bias`),0)
FROM `score_history`
WHERE `rule_type`='manual'
  AND `created_at` >= DATE_SUB(@score_month, INTERVAL 9 HOUR)
  AND `created_at` < DATE_SUB(DATE_ADD(@score_month, INTERVAL 1 MONTH), INTERVAL 9 HOUR)
GROUP BY `user_id`;
COMMIT;
