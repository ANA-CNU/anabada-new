-- Mirror the live anabada source, where the problem table predates verdict.
ALTER TABLE problem DROP COLUMN verdict;
SET SESSION time_zone = '+09:00';
INSERT INTO user (id,name,corrects,submissions,solution,kr_name,tier,ignored) VALUES
  (41,'alpha',1,1,100,'알파',23,0),
  (42,'beta',0,0,0,'베타',31,0),
  (43,'delta',0,0,0,'델타',31,0);
INSERT INTO problem (id,name,problem,problem_tier,time,level,repeatation) VALUES
  (70,'alpha',1000,9,'1970-01-01 00:00:00',0,0),
  (71,'alpha',1000,9,'2026-11-14 09:00:00',0,0);
INSERT INTO event (id,`begin`,`end`,title,created_at) VALUES
  (5,'2026-11-14 00:00:00','2026-11-25 00:00:00','재개 이벤트','2026-11-14 00:00:00'),
  (6,'2026-11-14 00:00:00','2026-11-25 00:00:00','두 번째 이벤트','2026-11-14 00:00:00');
INSERT INTO event_problem (event_id,problem,created_at) VALUES
  (5,1000,'2026-11-14 00:00:00'),(6,1000,'2026-11-15 00:00:00'),
  (5,1001,'2026-11-20 00:00:00'),(5,1002,'2026-11-21 00:00:00');
INSERT INTO score_history (id,user_id,`desc`,bias,event_id,problem_id,created_at) VALUES
  (21,41,'1000번 문제 해결',1,NULL,71,'2026-11-14 09:00:00'),
  (22,41,'Event(#5)의 1000번 문제 해결',1,5,71,'2026-11-14 09:00:00'),
  (23,41,'기존 수동 점수',-2,NULL,NULL,'2026-11-16 09:00:00');
INSERT INTO ranking_boards (id,title,is_active) VALUES (1,'기존 순위',1);
INSERT INTO ranked_users (board_id,`rank`,user_id) VALUES (1,1,41);
INSERT INTO hook (url,ignored) VALUES ('https://example.test/legacy-hook',1);
