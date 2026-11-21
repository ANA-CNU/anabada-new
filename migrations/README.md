# 데이터베이스 마이그레이션

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

마이그레이터는 이 디렉터리 바로 아래 `NNN_snake_case.sql`을 읽습니다. 활성 버전은 `002`부터 연속되며, 정올과 백준 변경 모두 `jungol_bada.migrations`의 한 이력에 기록됩니다. 새 변경은 마지막 번호에 1을 더해 추가합니다.

활성 SQL과 runner 소스는 이 디렉터리에 함께 있으며, stage/production의 이미지 build context도 이 디렉터리만 사용합니다. 따라서 저장소의 MySQL 데이터 디렉터리는 build context에 포함되지 않습니다.

한 번 적용 기록에 남은 SQL 파일의 파일명과 내용은 **불변**입니다. 수정하면 SHA-256 checksum 불일치로 마이그레이터가 실패하며, DB에는 추가 변경을 하지 않습니다. 수정이 필요하면 새 버전의 순방향 SQL을 추가합니다.

`legacy/000_initial_schema.sql`, `legacy/001_new_schema.sql`은 역사 기록일 뿐 자동 실행 대상이 아닙니다. 이미지에도 포함되지 않습니다. 기존에 `jungol_bada`가 있지만 `migrations` 테이블이 없는 DB는 관리되지 않은 DB로 보고 자동 변경 없이 실패합니다. 자동 rollback은 제공하지 않습니다.

## 006·007 백준 스키마와 기존 데이터 이관

`006_create_boj_bada.sql`은 `boj_bada` 스키마를 만듭니다. `007_import_anabada.sql`은 같은 MySQL 서버의 `anabada`에서 데이터와 이관 완료 표시를 한 트랜잭션으로 커밋합니다. 이관 완료 표시가 이미 있으면 다음 실행에서 `007`의 적용 기록만 남깁니다. 원본이 아직 없는 환경에서는 `006`까지 적용하고 `007`부터 순서대로 대기합니다. 자세한 내용은 [백준 이관 문서](../docs/boj-ingestion.md)를 참고하세요.

dev, stage, production은 Compose의 `database-migrator`로 이 파일들을 적용합니다. 개발과 stage에서 `anabada` 원본이 없으면 `006`으로 만든 빈 백준 DB를 사용할 수 있습니다. 공용 이력에 `012`가 기록되면 백엔드가 백준 수집을 시작합니다.

운영 배포는 `--require-boj-import`로 이관을 먼저 확인하고 백엔드를 교체합니다. 이관에 실패하면 기존 백엔드는 계속 동작합니다. 이미 적용된 파일의 번호와 checksum은 기존 이력으로 검증합니다.

`011_boj_all_user_history.sql`은 수집 제외 상태가 아닌 기존 백준 회원 전원을 solved.ac 공식 API 과거 풀이 대기열에 등록합니다. 진행 중인 회원의 페이지와 재시도 시각은 보존하며, 실제 풀이 적재는 백엔드가 API 호출 제한에 맞춰 수행합니다.

`012_simplify_boj_ingestion.sql`은 두 백준 수집 작업의 MySQL 잠금을 획득한 뒤 과거 풀이 핸들, 페이지, 재시도 시각을 `user`로 옮기고 사용이 끝난 테이블 4개를 제거합니다. `007`의 적용 여부는 공용 마이그레이션 이력으로 확인합니다.

`013_accounts_and_board.sql`은 기존 백준 회원을 가리키는 solved.ac 계정 연결·관리자 권한 테이블과 게시판 메타데이터·태그 테이블을 추가합니다. 기존 회원·점수·이벤트를 수정하거나 관리자 권한을 자동 부여하지 않습니다.

`014_board_drafts_and_media.sql`은 블로그 임시저장과 업로드 이미지의 소유권을 기록하는 테이블을 추가합니다.
