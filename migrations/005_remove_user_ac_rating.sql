USE `jungol_bada`;

-- 원시 AC Rating만 제거하며, 이미 저장된 사용자와 서비스 데이터를 초기화하지 않는다.
ALTER TABLE `user` DROP COLUMN `ac_rating`;
