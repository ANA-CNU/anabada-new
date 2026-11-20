CREATE DATABASE IF NOT EXISTS boj_bada CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS boj_bada.`user` (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  handle VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
  korean_name VARCHAR(25),
  atcoder_handle VARCHAR(50),
  codeforces_handle VARCHAR(50),
  corrects INT UNSIGNED NOT NULL DEFAULT 0,
  submissions INT UNSIGNED NOT NULL DEFAULT 0,
  solution BIGINT UNSIGNED NOT NULL DEFAULT 0,
  initial_submission_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  baseline_top BIGINT UNSIGNED,
  baseline_ready BOOLEAN NOT NULL DEFAULT TRUE,
  retry_required BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at DATETIME(3),
  solved_count_delta INT,
  tier TINYINT UNSIGNED NOT NULL DEFAULT 31 CHECK (tier <= 31),
  ignored BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.problem (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  problem INT UNSIGNED NOT NULL,
  problem_name VARCHAR(255),
  problem_tier INT NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  level INT NOT NULL,
  repeatation INT UNSIGNED NOT NULL,
  verdict VARCHAR(50) NOT NULL DEFAULT 'accepted',
  external_submission_id BIGINT UNSIGNED UNIQUE,
  score DECIMAL(10,6),
  KEY idx_boj_problem_member (user_id, problem),
  FOREIGN KEY (user_id) REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.event (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `begin` TIMESTAMP NOT NULL,
  `end` TIMESTAMP NOT NULL,
  title VARCHAR(255) NOT NULL,
  `desc` TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.event_problem (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  problem INT UNSIGNED NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_boj_event_problem (problem),
  FOREIGN KEY (event_id) REFERENCES boj_bada.event (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.score_history (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  `desc` TEXT,
  bias INT NOT NULL,
  rule_type VARCHAR(10) NOT NULL DEFAULT 'custom' CHECK (rule_type IN ('daily','event','custom','legacy')),
  award_key VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin UNIQUE,
  score_day DATE,
  event_id INT,
  problem_id BIGINT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rule_type IN ('legacy','custom') OR (award_key IS NOT NULL AND score_day IS NOT NULL)),
  KEY idx_boj_score_user_day (user_id, rule_type, score_day),
  KEY idx_boj_score_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES boj_bada.`user` (id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES boj_bada.event (id) ON DELETE SET NULL,
  FOREIGN KEY (problem_id) REFERENCES boj_bada.problem (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.user_bias_total (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  score_month DATE NOT NULL,
  total_point INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.ranking_boards (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.ranked_users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  board_id INT NOT NULL,
  `rank` INT NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boj_bada.ranking_boards (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.hook (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  ignored BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.boj_tier (
  kind ENUM('problem','user') NOT NULL,
  subject VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  tier TINYINT UNSIGNED,
  title VARCHAR(255),
  verified_at DATETIME(3),
  refresh_at DATETIME(3),
  failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, subject),
  KEY idx_boj_tier_refresh (refresh_at),
  CHECK (tier IS NULL OR tier <= 31 OR (kind='problem' AND tier=100))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.boj_tier_provider (
  id TINYINT NOT NULL PRIMARY KEY CHECK (id=1),
  next_at DATETIME(3) NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;
INSERT IGNORE INTO boj_bada.boj_tier_provider (id,next_at) VALUES (1,UTC_TIMESTAMP(3));

CREATE TABLE IF NOT EXISTS boj_bada.boj_import (
  id TINYINT NOT NULL PRIMARY KEY CHECK (id=1),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
