CREATE DATABASE IF NOT EXISTS `jungol_bada`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `jungol_bada`;

CREATE TABLE IF NOT EXISTS `user` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `corrects` int unsigned NOT NULL DEFAULT 0,
  `submissions` int unsigned NOT NULL DEFAULT 0,
  `solution` bigint unsigned NOT NULL DEFAULT 0 COMMENT 'last committed Jungol submission id',
  `kr_name` varchar(25) DEFAULT NULL,
  `atcoder_handle` varchar(50) DEFAULT NULL,
  `codeforces_handle` varchar(50) DEFAULT NULL,
  `tier` int NOT NULL DEFAULT 0,
  `ignored` tinyint(1) NOT NULL DEFAULT 0,
  `jungol_account_id` bigint unsigned NOT NULL,
  `last_rank_seen_at` datetime(3) DEFAULT NULL,
  `last_submission_synced_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_name` (`name`),
  UNIQUE KEY `uq_user_jungol_account_id` (`jungol_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `problem` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `name` varchar(50) NOT NULL,
  `problem` int unsigned NOT NULL,
  `problem_tier` int NOT NULL DEFAULT 0,
  `time` datetime(3) DEFAULT NULL,
  `time_text` varchar(50) NOT NULL,
  `level` int NOT NULL DEFAULT 0,
  `repeatation` int NOT NULL DEFAULT 0,
  `verdict` varchar(50) NOT NULL,
  `external_submission_id` bigint unsigned NOT NULL,
  `raw_result_text` varchar(100) NOT NULL,
  `score` decimal(10,6) DEFAULT NULL,
  `runtime_ms` int unsigned DEFAULT NULL,
  `memory_kb` int unsigned DEFAULT NULL,
  `code_length_bytes` int unsigned DEFAULT NULL,
  `language` varchar(50) DEFAULT NULL,
  `grouped_extra_count` int unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_problem_external_submission_id` (`external_submission_id`),
  KEY `idx_problem_user_problem` (`user_id`, `problem`),
  CONSTRAINT `fk_problem_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sync_run` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `started_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` timestamp(3) NULL DEFAULT NULL,
  `status` enum('running', 'success', 'partial', 'failed') NOT NULL DEFAULT 'running',
  `rank_count` int unsigned NOT NULL DEFAULT 0,
  `changed_user_count` int unsigned NOT NULL DEFAULT 0,
  `worker_count` int unsigned NOT NULL DEFAULT 0,
  `inserted_attempt_count` int unsigned NOT NULL DEFAULT 0,
  `error_code` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
