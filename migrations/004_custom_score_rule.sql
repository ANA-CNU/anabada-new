-- 관리자 직접 지급·차감 점수의 정본 이름을 manual에서 custom으로 변경한다.
-- 기존 점수 행·금액·사유·제출일·FK·캐시는 보존하며 자동 daily/event 규칙은 그대로 둔다.
-- 적용된 002/003은 checksum이 고정되어 있으므로 이 순방향 migration으로만 전환한다.
USE `jungol_bada`;

-- 기존 manual 행이 있는 동안 두 이름을 허용해야 데이터 손실 없이 전환할 수 있다.
ALTER TABLE `score_history`
  DROP CHECK `chk_score_rule`,
  DROP CHECK `chk_score_automatic_fields`,
  ALTER COLUMN `rule_type` SET DEFAULT 'custom',
  ADD CONSTRAINT `chk_score_rule` CHECK (`rule_type` IN ('manual','custom','daily','event')),
  ADD CONSTRAINT `chk_score_automatic_fields` CHECK (`rule_type` IN ('manual','custom') OR (`award_key` IS NOT NULL AND CHAR_LENGTH(`award_key`) > 0 AND `score_day` IS NOT NULL AND `bias` = 1));

UPDATE `score_history` SET `rule_type`='custom' WHERE `rule_type`='manual';

-- 전환 후에는 구 타입의 신규 저장을 거부한다. DDL 전체 rollback은 제공되지 않는다.
ALTER TABLE `score_history`
  DROP CHECK `chk_score_rule`,
  DROP CHECK `chk_score_automatic_fields`,
  ADD CONSTRAINT `chk_score_rule` CHECK (`rule_type` IN ('custom','daily','event')),
  ADD CONSTRAINT `chk_score_automatic_fields` CHECK (`rule_type` = 'custom' OR (`award_key` IS NOT NULL AND CHAR_LENGTH(`award_key`) > 0 AND `score_day` IS NOT NULL AND `bias` = 1));
