CREATE TABLE IF NOT EXISTS boj_bada.boj_solved_history (
  user_id INT UNSIGNED NOT NULL PRIMARY KEY,
  solved_handle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci,
  next_page INT UNSIGNED NOT NULL DEFAULT 0,
  next_at DATETIME(3) NOT NULL,
  KEY idx_boj_solved_history_due (next_at, user_id),
  FOREIGN KEY (user_id) REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO boj_bada.boj_solved_history (user_id,next_at)
SELECT id,UTC_TIMESTAMP(3) FROM boj_bada.`user` WHERE baseline_ready=0;
