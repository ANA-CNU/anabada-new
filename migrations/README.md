# Jungol Bada 활성 마이그레이션 규칙

## 005: `user.ac_rating` 제거

`005_remove_user_ac_rating.sql`은 `jungol_bada.user`에서 `ac_rating` 열만
순방향으로 제거합니다. 사용자 행, tier(0–31), `rank_wrong_count`, 문제, 점수,
이벤트, hook, 월간 캐시는 삭제하거나 초기화하지 않습니다.

`/group/1125/rank` 페이지는 전체 멤버 명부가 아니므로, 그 페이지의 AC Rating을
사용자 데이터의 사실로 저장하거나 관리자에서 수정할 수 없습니다. 직접 보관하는
실력 값은 tier뿐입니다. 그룹 메인에서 확인한 member tier 이미지의 숫자만 표시하며,
rank 전용 값은 비활성/보관 상태에만 사용합니다.

새 backend/collector는 005 이상이 필요하며 이전 backend/collector는 제거된 열을
조회하거나 갱신하므로 호환되지 않습니다. stage와 production은 백업을 확보하고 모든
이미지를 먼저 build한 뒤 backend와 collector만 중지하여 migration을 적용하고 새 앱을
시작해야 합니다. MySQL 컨테이너와 데이터 디렉터리를 중지·삭제·초기화하지 않습니다.
자동 rollback은 제공하지 않습니다.

## 004: 관리자 점수 타입 `custom`

`004_custom_score_rule.sql`은 `score_history.rule_type`의 관리자 점수 이름을
`manual`에서 `custom`으로 변경합니다. 기존 행은 타입만 바꾸며 ID, 점수, 사유,
날짜, 문제/이벤트 연결과 월간 캐시를 보존합니다. `daily`와 `event`는 바꾸지 않습니다.
변경 후 기본값은 `custom`이며 CHECK 제약은 `custom`, `daily`, `event`만 허용합니다.

004 시점의 새 backend는 004 이상이 필요했습니다. stage/prod는 기존 Compose migration 선행
실행 경로를 사용하고, dev DB도 backend 실행 전에 최신 migration까지 준비해야 합니다.
기존 backend는 custom 결과를 읽지 못하므로 전환 시 이전 backend의 요청을 중지하고
004 적용 후 새 backend를 실행하세요. 운영 DB 적용 전 백업을 확보하세요.
MySQL DDL은 파일 전체가 원자적으로 rollback되지 않으므로 실패 시 DB를 삭제하지 말고
실패 지점과 제약 상태를 확인하세요. 이 SQL에는 점수 삭제나 재지급이 없습니다.

현재 점수 계약은 [점수 종류 문서](../docs/score-rules.md)를 참고하세요.

이 디렉터리의 `NNN_snake_case.sql`만 자동 마이그레이터가 읽습니다. 현재 활성 버전은 `002`부터 연속되어야 하며, 새 변경은 마지막 버전보다 정확히 1 큰 세 자리 번호로 추가합니다.

활성 SQL과 runner 소스는 이 디렉터리에 함께 있으며, stage/production의 이미지 build context도 이 디렉터리만 사용합니다. 따라서 저장소의 MySQL 데이터 디렉터리는 build context에 포함되지 않습니다.

한 번 적용 기록에 남은 SQL 파일의 파일명과 내용은 **불변**입니다. 수정하면 SHA-256 checksum 불일치로 마이그레이터가 실패하며, DB에는 추가 변경을 하지 않습니다. 수정이 필요하면 새 버전의 순방향 SQL을 추가합니다.

`legacy/000_initial_schema.sql`, `legacy/001_new_schema.sql`은 역사 기록일 뿐 자동 실행 대상이 아닙니다. 이미지에도 포함되지 않습니다. 기존에 `jungol_bada`가 있지만 `migrations` 테이블이 없는 DB는 관리되지 않은 DB로 보고 자동 변경 없이 실패합니다. 자동 rollback은 제공하지 않습니다.

stage와 production은 별도 runner가 아니라 Compose 의존성으로 migration을 적용합니다. 각 환경 파일명을 명시해 아래 순서로 실행합니다. 먼저 `COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.stage.yaml config --quiet` 또는 `docker-compose.prod.yaml config --quiet`를 실행하고, 같은 파일로 `build`를 완료합니다. 그 뒤 `stop anabada-backend jungol-collector`만 실행하고, `up -d --no-build --remove-orphans --wait --wait-timeout 180`으로 다시 시작합니다. 마지막으로 `restart bada-nginx`와 `ps`를 실행합니다. Compose는 MySQL healthcheck와 `jungol-migrator`의 성공 종료 뒤 앱 시작을 강제합니다. 실패하면 Compose가 nonzero로 끝나며 종속 앱은 시작하지 않습니다. MySQL과 데이터 디렉터리는 이 순서에서 중지·삭제·초기화하지 않습니다. dev Compose에는 migrator가 없으므로 스키마 준비는 개발자 책임입니다.
