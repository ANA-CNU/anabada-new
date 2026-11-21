CREATE TABLE IF NOT EXISTS boj_bada.solved_ac_accounts (
  solved_ac_id BIGINT UNSIGNED PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  solved_ac_handle VARCHAR(64) NOT NULL,
  CONSTRAINT solved_ac_accounts_user_fk FOREIGN KEY (user_id)
    REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.admin_users (
  user_id INT UNSIGNED PRIMARY KEY,
  CONSTRAINT admin_users_user_fk FOREIGN KEY (user_id)
    REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.board_post (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  author_id INT UNSIGNED NULL,
  author_name VARCHAR(80) NOT NULL,
  title VARCHAR(120) NOT NULL,
  excerpt VARCHAR(240) NOT NULL,
  body_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX board_post_recent (created_at, id),
  CONSTRAINT board_post_author_fk FOREIGN KEY (author_id)
    REFERENCES boj_bada.`user` (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.board_post_tag (
  post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tag VARCHAR(24) NOT NULL,
  PRIMARY KEY (post_id, tag),
  INDEX board_post_tag_lookup (tag, post_id),
  CONSTRAINT board_post_tag_post_fk FOREIGN KEY (post_id)
    REFERENCES boj_bada.board_post (id) ON DELETE CASCADE
) ENGINE=InnoDB;
