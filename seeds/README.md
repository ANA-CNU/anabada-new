# 로컬 seeded preview

`./seeds/start.sh`는 루트 `.env`를 명시적으로 전달해, 기존 dev/production Compose와 분리된 `anabada-dev-seeded` 프로젝트를 실행합니다. MySQL 9.3.0의 새 named volume `anabada-dev-seeded_mysql-data`만 사용하며, collector는 이 Compose 파일에 포함하지 않습니다.

시드는 고정 demo ID와 UPSERT를 사용하므로 같은 dedicated preview DB에서 반복 실행해도 중복 행을 만들지 않습니다. 002와 003 마이그레이션이 새 DB에 먼저 적용되고 시드가 완료돼야 앱이 시작됩니다. `start.sh`가 local Docker context와 고정 Compose project를 검사하며, SQL은 이 전용 Compose의 `anabada-mysql` / `jungol_bada`를 대상으로 작성되었습니다.

데이터셋은 가짜 사용자 30명, 사용자당 6개 AC(반복 AC 포함), 7개 순위 보드(각 30명), 과거·진행·예정 이벤트와 문제 칩, 일일·이벤트·수동(감점 포함) 점수 원장으로 구성됩니다. 관리자 로그인은 새 계정을 만들지 않고 루트 `.env`의 `ADMIN_USERNAME`과 `ADMIN_PASSWORD`를 그대로 사용합니다.

브라우저는 `http://localhost:20050`에서 열 수 있습니다. backend의 `WEBHOOK_URL`은 빈 값으로 강제되어 외부 알림이 발생하지 않습니다.

중지는 `./seeds/stop.sh`를 사용합니다. 이 명령은 volume을 삭제하지 않으며 다른 Compose 프로젝트의 컨테이너도 중지하지 않습니다.

UI만 변경했다면 데이터 UPSERT를 다시 실행하지 않도록 `docker compose --project-name anabada-dev-seeded --env-file .env -f docker-compose.seeded-preview.yaml up -d --build --no-deps anabada-frontend`를 사용하세요. 시드 SQL을 변경했거나 demo 값을 새로 적용할 때만 `./seeds/start.sh`를 실행합니다. 이 명령은 fixed demo ID의 값을 UPSERT로 갱신하므로 preview에서 직접 수정한 demo 행은 덮어쓸 수 있습니다.

UTF-8 시드 회귀는 실제 MySQL 9.3.0과 002·003 migrator를 쓰는 `node seeds/test.mjs`로 확인합니다. 이 테스트는 임시 컨테이너·네트워크·이미지와 tmpfs 데이터만 만들고 종료 시 제거합니다.
