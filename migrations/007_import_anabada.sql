-- Import once after 006. All source tables are read only.
SET SESSION time_zone = '+00:00';
START TRANSACTION WITH CONSISTENT SNAPSHOT;
INSERT INTO boj_bada.boj_import (id) VALUES (1);

INSERT INTO boj_bada.`user` (id,handle,korean_name,atcoder_handle,codeforces_handle,corrects,submissions,solution,initial_submission_id,tier,ignored)
SELECT id,name,kr_name,atcoder_handle,codeforces_handle,corrects,submissions,solution,solution,tier,ignored FROM anabada.`user`;

INSERT INTO boj_bada.event (id,`begin`,`end`,title,`desc`,created_at)
SELECT id,`begin`,`end`,title,`desc`,created_at FROM anabada.event;
INSERT INTO boj_bada.event_problem (id,event_id,problem,added_at)
SELECT id,event_id,problem,created_at FROM anabada.event_problem;

INSERT INTO boj_bada.problem (id,user_id,problem,problem_tier,submitted_at,level,repeatation)
SELECT p.id,u.id,p.problem,p.problem_tier,
       IF(p.time='1970-01-01 00:00:00','1970-01-01 00:00:01',DATE_SUB(p.time, INTERVAL 9 HOUR)),
       p.level,ROW_NUMBER() OVER (PARTITION BY u.id,p.problem ORDER BY p.time,p.id)-1
FROM anabada.problem p JOIN anabada.`user` u ON u.name=p.name;

INSERT INTO boj_bada.score_history (id,user_id,`desc`,bias,rule_type,award_key,score_day,event_id,problem_id,created_at)
WITH classified AS (
  SELECT s.*, p.problem AS number, DATE(DATE_ADD(s.created_at, INTERVAL 9 HOUR)) AS day,
    CASE
      WHEN s.bias=1 AND s.event_id IS NULL AND BINARY s.`desc`=BINARY CONCAT(p.problem,'번 문제 해결') THEN 'daily'
      WHEN s.bias=1 AND s.event_id IS NOT NULL AND BINARY s.`desc`=BINARY CONCAT('Event(#',s.event_id,')의 ',p.problem,'번 문제 해결') THEN 'event'
      ELSE 'legacy'
    END AS kind
  FROM anabada.score_history s LEFT JOIN boj_bada.problem p ON p.id=s.problem_id AND p.user_id=s.user_id
), keyed AS (
  SELECT classified.*,
    CASE kind
      WHEN 'daily' THEN CONCAT('daily:',user_id,':',day)
      WHEN 'event' THEN CONCAT('event:',event_id,':',user_id,':',number)
    END AS award
  FROM classified
), ordered AS (
  SELECT keyed.*, ROW_NUMBER() OVER (PARTITION BY award ORDER BY created_at,id) AS ordinal FROM keyed
)
SELECT id,user_id,`desc`,bias,IF(ordinal=1,kind,'legacy'),
       IF(ordinal=1,award,NULL),IF(ordinal=1 AND award IS NOT NULL,day,NULL),event_id,problem_id,created_at
FROM ordered;

INSERT INTO boj_bada.ranking_boards (id,title,created_at,is_active)
SELECT id,title,created_at,is_active FROM anabada.ranking_boards;
INSERT INTO boj_bada.ranked_users (id,board_id,`rank`,user_id)
SELECT id,board_id,`rank`,user_id FROM anabada.ranked_users;
INSERT INTO boj_bada.hook (id,url,ignored,created_at)
SELECT id,url,COALESCE(ignored,1),created_at FROM anabada.hook;

SET @month = CAST(DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 HOUR), '%Y-%m-01') AS DATE);
INSERT INTO boj_bada.user_bias_total (user_id,score_month,total_point)
SELECT u.id,@month,COALESCE(SUM(s.bias),0)
FROM boj_bada.`user` u LEFT JOIN boj_bada.score_history s ON s.user_id=u.id
  AND s.created_at>=DATE_SUB(@month,INTERVAL 9 HOUR)
  AND s.created_at<DATE_SUB(DATE_ADD(@month,INTERVAL 1 MONTH),INTERVAL 9 HOUR)
GROUP BY u.id;

INSERT INTO boj_bada.boj_tier (kind,subject,tier)
SELECT 'problem',CAST(problem AS CHAR),problem_tier
FROM (
  SELECT problem,problem_tier,ROW_NUMBER() OVER (PARTITION BY problem ORDER BY submitted_at DESC,id DESC) AS latest
  FROM boj_bada.problem WHERE problem_tier BETWEEN 1 AND 31
) known WHERE latest=1;
INSERT INTO boj_bada.boj_tier (kind,subject,tier)
SELECT 'user',handle,tier FROM boj_bada.`user`;
COMMIT;
