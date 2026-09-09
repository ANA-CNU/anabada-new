-- migrations/001_new_schema.sql
-- 기존 DB(000_initial_schema.sql) 구조를 100% 동일하게 가져가되, 
-- 신규 DB 환경에 맞게 AUTO_INCREMENT 시작값 및 쓰레기값을 초기화한 깨끗한 스키마입니다.

CREATE TABLE IF NOT EXISTS `chat_session` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `chat_message` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `message` text NOT NULL,
  `role` varchar(50) NOT NULL,
  `session_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_id` (`session_id`),
  CONSTRAINT `fk_chatmessage_session` FOREIGN KEY (`session_id`) REFERENCES `chat_session` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `begin` timestamp NOT NULL,
  `end` timestamp NOT NULL,
  `title` varchar(255) NOT NULL,
  `desc` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `event_problem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `problem` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event_id` (`event_id`),
  CONSTRAINT `fk_eventproblem_event` FOREIGN KEY (`event_id`) REFERENCES `event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hook` (
  `id` int NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL,
  `ignored` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hook_ignored_url` (`ignored`,`url`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `corrects` int NOT NULL,
  `submissions` int NOT NULL,
  `solution` int unsigned NOT NULL,
  `kr_name` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `atcoder_handle` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `codeforces_handle` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tier` int NOT NULL DEFAULT '0',
  `ignored` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `atcoder_handle` (`atcoder_handle`),
  UNIQUE KEY `codeforces_handle` (`codeforces_handle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `problem` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `problem` int NOT NULL,
  `problem_tier` int NOT NULL,
  `time` datetime NOT NULL,
  `level` int NOT NULL,
  `repeatation` int NOT NULL,
  `verdict` varchar(50) NOT NULL DEFAULT 'accepted',
  PRIMARY KEY (`id`),
  KEY `FK_problem_user` (`name`),
  CONSTRAINT `FK_problem_user` FOREIGN KEY (`name`) REFERENCES `user` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `ranking_boards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ranked_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `board_id` int NOT NULL,
  `rank` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_board_id` (`board_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_rankedusers_board` FOREIGN KEY (`board_id`) REFERENCES `ranking_boards` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rankedusers_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `score_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `desc` text,
  `bias` int NOT NULL,
  `event_id` int DEFAULT NULL,
  `problem_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_event_id` (`event_id`),
  KEY `fk_scorehistory_problem_id` (`problem_id`),
  KEY `idx_user_created` (`user_id`,`created_at`),
  CONSTRAINT `fk_scorehistory_event` FOREIGN KEY (`event_id`) REFERENCES `event` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_scorehistory_problem_id` FOREIGN KEY (`problem_id`) REFERENCES `problem` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_scorehistory_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_bias_total` (
  `user_id` int NOT NULL,
  `total_point` int DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_userbiastotal_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
