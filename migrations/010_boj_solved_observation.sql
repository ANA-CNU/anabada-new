SET @boj_solved_observation = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='boj_bada' AND TABLE_NAME='problem' AND COLUMN_NAME='solved_ac_observed_at'),
  'DO 0',
  'ALTER TABLE boj_bada.problem ADD COLUMN solved_ac_observed_at DATETIME(3) NULL'
);
PREPARE boj_solved_observation FROM @boj_solved_observation;
EXECUTE boj_solved_observation;
DEALLOCATE PREPARE boj_solved_observation;
