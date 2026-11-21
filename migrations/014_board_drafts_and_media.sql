CREATE TABLE IF NOT EXISTS boj_bada.board_draft (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  author_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  tags VARCHAR(200) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX board_draft_author_recent (author_id, updated_at, id),
  CONSTRAINT board_draft_author_fk FOREIGN KEY (author_id)
    REFERENCES boj_bada.`user` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS boj_bada.board_image (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id INT UNSIGNED NULL,
  post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT board_image_owner_fk FOREIGN KEY (owner_id)
    REFERENCES boj_bada.`user` (id) ON DELETE SET NULL,
  CONSTRAINT board_image_post_fk FOREIGN KEY (post_id)
    REFERENCES boj_bada.board_post (id) ON DELETE CASCADE
) ENGINE=InnoDB;
