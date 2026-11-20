CREATE TABLE IF NOT EXISTS boj_bada.boj_member_admission (
  handle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL PRIMARY KEY,
  solved_handle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci,
  try_api BOOLEAN NOT NULL DEFAULT FALSE,
  next_at DATETIME(3) NOT NULL,
  seen_at DATETIME(3) NOT NULL,
  KEY idx_boj_member_admission_due (solved_handle, next_at)
) ENGINE=InnoDB;
