# Jungol Bada 활성 마이그레이션 규칙

이 디렉터리의 `NNN_snake_case.sql`만 자동 마이그레이터가 읽습니다. 현재 활성 버전은 `002`부터 연속되어야 하며, 새 변경은 마지막 버전보다 정확히 1 큰 세 자리 번호로 추가합니다.

한 번 적용 기록에 남은 SQL 파일의 파일명과 내용은 **불변**입니다. 수정하면 SHA-256 checksum 불일치로 마이그레이터가 실패하며, DB에는 추가 변경을 하지 않습니다. 수정이 필요하면 새 버전의 순방향 SQL을 추가합니다.

`legacy/000_initial_schema.sql`, `legacy/001_new_schema.sql`은 역사 기록일 뿐 자동 실행 대상이 아닙니다. 이미지에도 포함되지 않습니다. 기존에 `jungol_bada`가 있지만 `migrations` 테이블이 없는 DB는 관리되지 않은 DB로 보고 자동 변경 없이 실패합니다. 자동 rollback은 제공하지 않습니다.

stage/production은 별도 runner가 아니라 일반 `COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.{stage,prod}.yaml up -d --build --wait --wait-timeout 180`에서 자동 적용합니다. 이는 CI에서 확인된 구버전 Compose/Bake 조합의 이미지 선택 결함을 피하기 위해 Bake 위임만 끄며 BuildKit 캐시·단일 `up`·migration 의존성은 유지합니다. Compose는 MySQL healthcheck, `jungol-migrator`의 성공 종료(`Exited (0)`), 그 뒤 앱 시작 순서를 강제합니다. 실패하면 Compose가 nonzero로 끝나며 종속 앱은 시작하지 않습니다. `docker compose ... ps`와 `docker compose ... logs jungol-migrator`로 상태를 확인합니다. dev Compose에는 migrator가 없으므로 스키마 준비는 개발자 책임입니다.
