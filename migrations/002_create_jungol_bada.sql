-- Jungol 수집 데이터를 저장할 새 논리 데이터베이스를 만드는 자동 마이그레이션이다.
-- migrator가 mysql batch mode와 같은 fail-fast 방식으로 실행하며, 중간 오류 뒤에는 기록하지 않는다.
-- jungol_bada가 존재하지 않는 빈 환경에서만 최초 실행된다. 이미 존재하면 migrator가 관리 상태를 확인한다.
-- 이 파일은 기존 데이터베이스를 수정·복사·삭제하지 않으며, 부분 적용된 스키마를 자동 복구하지 않는다.
CREATE DATABASE `jungol_bada` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `jungol_bada`;

-- DB 연결의 기준 시간대를 UTC로 고정한다.
-- 사용자에게 날짜를 보여주거나 일일 점수를 계산할 때만 애플리케이션에서 Asia/Seoul 기준으로 변환한다.
SET SESSION time_zone = '+00:00';

-- 특정 기간에 지정 문제를 해결하면 추가 점수를 지급하는 이벤트 정의다.
-- begin은 포함하고 end는 포함하지 않는 반개방 구간 [begin, end)으로 사용한다.
CREATE TABLE `event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `begin` timestamp NOT NULL,
  `end` timestamp NOT NULL,
  `title` varchar(255) NOT NULL,
  `desc` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_event_interval` CHECK (`begin` < `end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 이벤트에 포함되는 Jungol 문제 번호를 관리한다.
-- 문제가 이벤트에 등록되기 전의 과거 제출에 점수가 소급 지급되지 않도록 등록 시각을 보존한다.
CREATE TABLE `event_problem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `problem` int unsigned NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_event_problem` (`event_id`,`problem`),
  KEY `idx_event_id` (`event_id`),
  KEY `idx_event_problem_number` (`problem`,`event_id`),
  CONSTRAINT `fk_eventproblem_event` FOREIGN KEY (`event_id`) REFERENCES `event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 내부 순위가 바뀌었을 때 알림을 전송할 웹훅 주소를 보관한다.
-- ignored=1인 주소는 collector가 전송 대상에서 제외한다.
CREATE TABLE `hook` (
  `id` int NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL,
  `ignored` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hook_ignored_url` (`ignored`,`url`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Jungol 그룹에 속한 사용자의 기준 정보와 마지막 수집 지점을 저장한다.
-- 별도의 rank 테이블은 만들지 않으며, Jungol 랭킹 페이지의 값은 이 테이블과 직접 비교한다.
CREATE TABLE `user` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  -- Jungol 랭킹의 계정 링크(handle)에서 읽은 로그인 사용자명이다. 외부 nickname/name은 저장하지 않는다.
  `jungol_name` varchar(50) NOT NULL,
  -- 마지막으로 정상 반영한 Jungol 랭킹 페이지의 서로 다른 해결 문제 수다.
  `corrects` int unsigned NOT NULL DEFAULT 0,
  -- problem 테이블에 저장된 해당 사용자의 AC 제출 행 수다. 같은 문제의 반복 AC도 포함한다.
  `submissions` int unsigned NOT NULL DEFAULT 0,
  -- 마지막으로 끝까지 검사하고 transaction으로 정상 커밋한 Jungol 제출 번호다.
  -- 검사 완료한 최신 제출이 오답이어도 cursor는 그 제출 번호까지 전진할 수 있다.
  `solution` bigint unsigned NOT NULL DEFAULT 0 COMMENT '마지막으로 검사 완료하고 커밋한 Jungol 제출 번호이며 오답 제출 번호일 수도 있음',
  -- 관리자가 입력한 내부 한글 표기다. Jungol nickname/name에서 채우지 않으며, 기본 표시는 jungol_name이다.
  `korean_name` varchar(25) DEFAULT NULL,
  -- 서비스 점수 규칙에서 사용하는 0~31 범위의 정규화 난이도 값이다.
  `tier` int NOT NULL DEFAULT 0,
  -- Jungol 랭킹 페이지에서 읽은 원본 AC Rating 값이다. tier와 같은 값이 아니다.
  `ac_rating` int unsigned NOT NULL DEFAULT 0,
  -- 수집 또는 내부 순위에서 제외할 사용자를 표시한다.
  `ignored` tinyint(1) NOT NULL DEFAULT 0,
  -- 로그인 사용자명(handle) 변경과 무관하게 사용자를 식별하는 Jungol의 불변 숫자 account ID다.
  `jungol_account_id` bigint unsigned NOT NULL,
  -- 마지막으로 정상 반영한 Jungol 랭킹 페이지의 틀린 문제 수다.
  `rank_wrong_count` int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_jungol_name` (`jungol_name`),
  CONSTRAINT `chk_user_tier` CHECK (`tier` BETWEEN 0 AND 31),
  UNIQUE KEY `uq_user_jungol_account_id` (`jungol_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Jungol에서 확인한 AC 제출을 한 건당 한 행으로 저장하는 제출 원장이다.
-- 문제 자체의 사전 테이블이 아니며, 동일한 문제를 여러 번 AC하면 각각 별도 행으로 저장한다.
-- WA, TLE, RE 등의 비정답 제출은 이 테이블에 저장하지 않는다.
CREATE TABLE `problem` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 이 제출을 한 내부 사용자다.
  `user_id` int unsigned NOT NULL,
  -- Jungol의 문제 번호다.
  `problem` int unsigned NOT NULL,
  -- 수집 당시 확인한 문제 제목이다. 제목 확인에 실패하면 NULL일 수 있다.
  `problem_name` varchar(255) DEFAULT NULL,
  -- 수집 당시 확인한 문제 난이도다. 알 수 없는 경우 0을 사용한다.
  `problem_tier` int NOT NULL DEFAULT 0,
  -- Jungol에 실제로 제출한 UTC 시각이다. 시간은 이 컬럼 하나에만 저장한다.
  `submitted_at` datetime(3) NOT NULL,
  -- 기존 서비스 점수 계산과 화면 호환을 위한 상대 난이도 값이다.
  `level` int NOT NULL DEFAULT 0,
  -- 같은 사용자·문제 조합에서 앞서 저장된 AC 개수다. 최초 AC는 0이다.
  `repeatation` int NOT NULL DEFAULT 0,
  -- 제출 판정이다. 현재 AC만 저장하므로 accepted만 허용한다.
  `verdict` varchar(50) NOT NULL,
  -- 실제 Jungol 제출 번호다. 초기 요약 기준선 행에는 제출 번호가 없어서 NULL이며, 실제 제출 번호의 UNIQUE 보장은 그대로 유지한다.
  `external_submission_id` bigint unsigned NULL,
  -- Jungol 응답에 원문 채점 점수가 있는 경우 보존한다. 서비스에서 지급하는 bias와는 별개다.
  `score` decimal(10,6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_problem_external_submission_id` (`external_submission_id`),
  KEY `idx_problem_user_problem` (`user_id`, `problem`),
  KEY `idx_problem_user_first_submitted` (`user_id`,`repeatation`,`submitted_at`),
  KEY `idx_problem_first_submitted` (`repeatation`,`submitted_at`),
  CONSTRAINT `chk_problem_accepted` CHECK (BINARY `verdict` = BINARY 'accepted'),
  CONSTRAINT `chk_problem_repeatation` CHECK (`repeatation` >= 0),
  CONSTRAINT `fk_problem_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 서비스 내부 점수 순위의 한 시점 또는 한 기간을 나타내는 보드다.
-- Jungol의 /group/{groupId}/rank 페이지 내용을 저장하는 테이블이 아니다.
CREATE TABLE `ranking_boards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 내부 순위 보드에 포함된 사용자와 순서를 저장한다.
-- 한 보드에서 같은 사용자 또는 같은 순위가 중복되지 않도록 UNIQUE 제약을 둔다.
CREATE TABLE `ranked_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `board_id` int NOT NULL,
  `rank` int NOT NULL,
  `user_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ranked_board_user` (`board_id`,`user_id`),
  UNIQUE KEY `uq_ranked_board_rank` (`board_id`,`rank`),
  CONSTRAINT `chk_ranked_positive` CHECK (`rank` > 0),
  KEY `idx_board_id` (`board_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_rankedusers_board` FOREIGN KEY (`board_id`) REFERENCES `ranking_boards` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rankedusers_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 일반 일일 점수, 이벤트 점수, 관리자가 수동 조정한 점수를 모두 기록하는 점수 원장이다.
-- 자동 점수는 award_key로 멱등성을 보장하여 같은 근거로 점수가 중복 지급되지 않게 한다.
CREATE TABLE `score_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `desc` text,
  `bias` int NOT NULL,
  `rule_type` varchar(50) NOT NULL DEFAULT 'manual',
  `award_key` varchar(255) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `score_day` date DEFAULT NULL,
  `event_id` int DEFAULT NULL,
  `problem_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_score_history_award_key` (`award_key`),
  KEY `idx_score_user_rule_day` (`user_id`,`rule_type`,`score_day`),
  CONSTRAINT `chk_score_rule` CHECK (`rule_type` IN ('manual','daily','event')),
  CONSTRAINT `chk_score_automatic_fields` CHECK (`rule_type` = 'manual' OR (`award_key` IS NOT NULL AND CHAR_LENGTH(`award_key`) > 0 AND `score_day` IS NOT NULL AND `bias` = 1)),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_event_id` (`event_id`),
  KEY `fk_scorehistory_problem_id` (`problem_id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  CONSTRAINT `fk_scorehistory_event` FOREIGN KEY (`event_id`) REFERENCES `event` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_scorehistory_problem_id` FOREIGN KEY (`problem_id`) REFERENCES `problem` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_scorehistory_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 사용자별 현재 월 점수 합계 캐시다.
-- 점수 또는 수집 상태의 원장이 아니며, 원본은 score_history다.
CREATE TABLE `user_bias_total` (
  `user_id` int unsigned NOT NULL,
  `total_point` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_userbiastotal_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
