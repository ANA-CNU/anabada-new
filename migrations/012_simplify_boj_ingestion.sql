-- Preserve unfinished solved.ac pagination on each member before removing the old tables.
SET @boj_history_columns = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='boj_bada' AND TABLE_NAME='user' AND COLUMN_NAME='solved_ac_history_page'),
  'DO 0',
  'ALTER TABLE boj_bada.`user`
    ADD COLUMN solved_ac_handle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
    ADD COLUMN solved_ac_history_page INT UNSIGNED NULL,
    ADD COLUMN solved_ac_history_next_at DATETIME(3) NULL'
);
PREPARE boj_history_columns FROM @boj_history_columns;
EXECUTE boj_history_columns;
DEALLOCATE PREPARE boj_history_columns;

SET @boj_copy_history = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA='boj_bada' AND TABLE_NAME='boj_solved_history'),
  'UPDATE boj_bada.`user` u JOIN boj_bada.boj_solved_history h ON h.user_id=u.id
   SET u.solved_ac_handle=h.solved_handle, u.solved_ac_history_page=h.next_page,
       u.solved_ac_history_next_at=h.next_at',
  'DO 0'
);
PREPARE boj_copy_history FROM @boj_copy_history;
EXECUTE boj_copy_history;
DEALLOCATE PREPARE boj_copy_history;

DROP TABLE IF EXISTS boj_bada.boj_solved_history, boj_bada.boj_member_admission,
                     boj_bada.boj_tier, boj_bada.boj_import;
