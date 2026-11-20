INSERT IGNORE INTO boj_bada.boj_solved_history (user_id,next_at)
SELECT id,UTC_TIMESTAMP(3) FROM boj_bada.`user` WHERE ignored=0;
