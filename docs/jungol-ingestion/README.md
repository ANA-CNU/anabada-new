# Jungol collector 운영·개발 가이드

기준: 2026-09-08 작업 트리. 이 문서는 `collector/` 구현의 운영 계약입니다. [초기 기획](./planning-2026-09-07.md), [컨테이너 POC](./container-poc-2026-09-07.md), [랭킹→DB POC](./rank-worker-db-poc-2026-09-07.md)는 당시 증거를 보존한 역사 기록입니다. 역사 문서의 모든 결과 저장 및 5분 systemd 제안을 현재 배포에 적용하지 않습니다.

## 데이터 정책과 검증 범위

backend와 collector는 새 `jungol_bada`를 사용합니다. 기존 `anabada`의 사용자, 이벤트, 점수, 제출을 복사하거나 수정하지 않습니다. 처음에는 업무 테이블이 비어 있습니다. 운영 이벤트도 새 DB에서 생성해야 합니다. 과거 데이터와 새 Jungol identity를 자동 연결하지 않습니다.

현재 `problem`은 AC(`accepted`) 시도만 저장합니다. AC 0점도 결과 코드가 AC라면 포함합니다. 동일 문제의 반복 AC는 별도 제출 ID로 보존하고 `repeatation`으로 구분합니다. `user.submissions`는 저장된 AC 수이며 Jungol의 전체 채점 횟수가 아닙니다. 오답 수는 `rank_wrong_count`에 랭킹 메타데이터로 저장합니다.

2026-09-08 현재 Playwright 1.63.0 Linux test image에서 로그인/CAPTCHA/Cloudflare/rank drift/submission pagination/BSON fixture를 포함한 전체 브라우저 테스트를 통과했다. 별도 MySQL 8.4 container에서는 확정 9테이블 SQL로 AC-only 적재, 초기/증분 점수, 멱등성, cursor, rollback, advisory lock과 projection 복구를 통과했다. 실제 운영 IP의 접근 허용, 서버 secret 권한, live profile 재사용, 긴 계정의 실페이지 pagination과 production 이벤트/랭킹 결과는 여전히 별도 acceptance가 필요하다. fixture 성공을 운영 서버 성공으로 표기하지 않는다.

## 구현 구조와 정확한 흐름

| 책임 | 구현 |
|---|---|
| 조립·CLI·생명주기 | `CollectorBootstrap`, `CollectorApplication`, `CollectorRuntime`, `CollectorService` |
| cycle 조정 | `SyncCycle`, `SyncCycleExecutor`, `SyncPlanner`, `AccountWorkerPool` |
| 세션·랭킹·제출 | `JungolSession`, `RankCollector`, `AccountSummaryCollector`, `SubmissionCursorCollector`, `SubmissionCollector`, `SubmissionWireDecoder` |
| 사용자 작업·메타 갱신 | `AccountSyncWorker`, `MetadataRefreshService` |
| 사용자 transaction | `AccountSyncService`, `AccountUnitOfWork`, transaction-bound repository classes |
| 점수와 projection | `DailyScorePolicy`, `EventManager`, `ProjectionService` |
| 순위 변경 알림 | `ProjectionNotificationService`, `WebhookBroadcaster`, `DiscordWebhookClient`, `HookRepository` |

위 상대 경로는 `collector/src/` 기준입니다. 실행 주체는 backend cron이 아닌 독립 collector입니다.

1. `CollectorService`는 시작 즉시 cycle을 실행하고 완료 후 고정 600000ms만큼 기다립니다. 따라서 기본은 **완료 후 10분 간격**이고 벽시계 cron의 매 10분 정각이 아닙니다. 단일 프로세스 cycle은 겹치지 않습니다.
2. DB advisory lease `jungol_bada:collector`를 얻습니다. 충돌하면 외부 요청 없이 이번 cycle을 끝냅니다. profile도 한 프로세스만 사용해야 합니다.
3. persistent Chromium에서 그룹 접근을 확인하고 필요한 경우 로그인한 뒤 rank 전체를 읽습니다. 신규 account는 `/account/{id}`의 해결 목록과 `/account/{id}/submission` 첫 API 페이지의 최신 제출 번호만 읽습니다. 해결 목록 전체와 rank의 푼 문제 수가 일치해야 하며, 목록에는 synthetic baseline 행을 만들고 첫 제출 번호는 다음 증분 수집의 `user.solution`으로 저장합니다. 전체 제출 이력 pagination과 문제 metadata 요청은 하지 않습니다.
4. 기존 account 중 `rank.solvedCount > stored.corrects`인 사용자만 제출 페이지를 최신에서 과거로 순회합니다. DB cursor `user.solution`을 만날 때까지 최대 100페이지를 읽습니다. 중단 경계 누락, 순서 오류, 페이지 제한, 응답 해석 실패는 불완전한 이력을 commit하지 않습니다. 해결 수가 같은 사용자는 submission 페이지를 열지 않고 `jungol_name`, `rank_wrong_count`, `ac_rating`, 변환된 `tier`만 사용자별 짧은 transaction으로 갱신합니다. 감소는 `rank_regression` 오류이며 어떤 사용자 값도 수정하지 않습니다.
5. 네트워크 응답의 원본 시도를 복원하여 AC만 고르고 문제 메타데이터를 조회합니다. cursor 후보는 **검사한 모든 결과의 최고 제출 ID**이므로 rejected 행도 cursor 전진에 포함됩니다. 원본 payload나 쿠키를 저장하지 않습니다.
6. 네트워크 작업 종료 후 사용자 한 명의 transaction을 시작합니다. user row를 잠그고 기존 cursor, 이번 구간에서 새로 발견한 distinct 문제 수와 rank 증가분을 확인합니다. 기존 사용자의 전체 과거 distinct 수와 `corrects`가 같다고 강제하지 않습니다. 불일치는 rank 재조회와 최대 한 번의 재수집 후에도 남으면 실패합니다.
7. 제출 시각 순으로 중복 없는 AC를 저장하고 최초 해결 여부를 계산합니다. 일일 점수는 KST 날짜당 1회이며 최초 해결과 tier 조건을 만족해야 합니다. 현재 조건은 tier 미상(0), 문제 tier ≥11 또는 문제 tier ≥ 변환된 사용자 tier−5입니다. 원본 `ac_rating`은 이 계산에 사용하지 않습니다.
8. 초기 기준선은 각 해결 문제를 `1970-01-01T00:00:01Z`, `external_submission_id=NULL`, `accepted`, `problem_name=NULL`, tier 0, `repeatation=0`의 synthetic 행으로만 저장하며 일일·이벤트 점수와 `score_history`를 전혀 만들지 않습니다. 이 값은 실제 제출 시각이 아니라 과거 이력을 재생하지 않는 기준선 표식입니다. 증분에서만 `EventManager`가 문제 번호, `[begin,end)` 기간, 제출 시각 ≥ `event.created_at`, 제출 시각 ≥ `event_problem.added_at`을 모두 확인합니다. 반복 AC도 이벤트 조건을 만족할 수 있지만 사용자·이벤트·문제별 한 번만 지급합니다. unique `award_key`는 daily 및 event 재지급을 막습니다.
9. AC 행, 점수, 사용자 통계와 cursor, 월간 합계를 같은 사용자 transaction에서 commit합니다. 실패한 사용자는 rollback하고 다른 성공 사용자는 유지합니다.
10. worker 완료 후 별도 transaction으로 월간 `user_bias_total`, 가중 추첨 `ranking_boards`/`ranked_users` projection을 갱신합니다. 양수 점수·비제외 사용자가 없으면 새 board를 만들지 않습니다. projection 실패가 이미 성공한 사용자 commit을 되돌리지는 않으며 다음 cycle에서 다시 계산합니다.
11. projection transaction이 새 내부 순위 snapshot을 commit한 경우에만 `hook.ignored=0`인 Discord webhook 전체에 결과를 보냅니다. 메시지는 서비스 링크와 최대 상위 10명의 `jungol_name`, 점수를 포함합니다. 2xx가 아닌 응답, 10초 timeout, 연결 실패와 기존 Discord 영구 오류 코드는 해당 hook을 `ignored=1`로 바꿔 다음 cycle부터 제외합니다. 전송과 비활성화 실패는 이미 commit한 사용자·점수·순위를 rollback하지 않으며 webhook URL과 응답 본문을 로그에 기록하지 않습니다.

### 랭킹 trigger와 지연 이벤트의 한계

이미 푼 문제의 반복 AC는 solved count를 늘리지 않습니다. 이벤트 중 반복 AC를 해도 이후 새 문제 해결이 없으면 worker가 생성되지 않아 **무기한 수집 누락**이 가능합니다. 오답만 제출하는 계정도 trigger가 없습니다. 전체 feed 안전망 또는 강제 전수 재수집 CLI는 구현되어 있지 않습니다.

이후 새 문제를 풀어 지연 수집되면 점수는 수집 날짜가 아니라 원래 제출 timestamp를 사용합니다. 이미 종료한 이벤트여도 원래 기간과 생성/문제 추가 시각 조건을 만족하면 지급 가능합니다. 반대로 과거 제출 뒤 이벤트를 새로 만들거나 문제를 추가해도 retroactive award는 주지 않습니다. 이 정책은 반복 AC의 무기한 미수집을 해결하지 않습니다.

## 자동 마이그레이션과 DB 권한

stage/production은 [마이그레이터](../../migrations/)가 활성 `migrations/NNN_snake_case.sql`을 순방향으로만 적용합니다. `migrations` 테이블은 버전·파일명·SHA-256 checksum을 기록합니다. 이미 적용한 파일은 절대 수정하지 말고 새 버전을 추가합니다. `jungol_bada`가 이미 있으나 `migrations` 테이블이 없으면 관리되지 않은 DB로 판단하여 변경 없이 실패합니다. 자동 rollback은 없습니다.

승인된 운영 DB 관리자 접속 정보를 담은 저장소 밖의 제한된 client option 파일을 준비합니다. 아래 `MYSQL_OPERATOR_CNF`는 이 문서의 로컬 shell 변수이며 애플리케이션 환경 변수가 아닙니다. 파일 경로만 지정하고 비밀번호는 명령행에 넣지 않습니다. 실제 서버에 실행하기 전 백업과 대상 hostname/port를 확인합니다.

```sh
MYSQL_OPERATOR_CNF=/absolute/private/operator.cnf
mysql --defaults-extra-file="$MYSQL_OPERATOR_CNF" --batch --execute="SELECT @@hostname, @@port; SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='jungol_bada';"
```

stage/production의 일반 Compose 실행은 MySQL healthcheck 뒤 migrator를 한 번 실행하고, 성공 종료(`Exited (0)`) 후에만 frontend·middleware·backend·collector를 시작합니다. `--build`는 현재 migration image를 포함하도록 필수입니다.

```sh
COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.stage.yaml up -d --build --wait --wait-timeout 180
COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.prod.yaml up -d --build --wait --wait-timeout 180
mysql --defaults-extra-file="$MYSQL_OPERATOR_CNF" --database=jungol_bada --batch --execute="SELECT DATABASE(); SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema=DATABASE(); SELECT COUNT(*) AS users FROM user; SELECT COUNT(*) AS attempts FROM problem; SELECT COUNT(*) AS awards FROM score_history;"
```

상태는 다음 조회로 확인합니다. 최초 성공 뒤 `jungol_bada`에는 업무 9개 테이블과 `migrations` 테이블이 있으며 version 2와 64자리 checksum이 기록됩니다.

```sql
SELECT version, filename, checksum_sha256, applied_at FROM jungol_bada.migrations ORDER BY version;
```

현재 운영 정책은 backend와 collector, migrator 모두 MySQL `root` 계정과 루트 `.env`의 동일한 `DB_PASSWORD`를 사용하는 것입니다. 주소는 `anabada-mysql:3306`, DB 이름은 `jungol_bada`로 고정합니다. 별도 collector 계정이나 role을 생성하지 않습니다.

`docker compose ... ps`와 `docker compose ... logs jungol-migrator`로 실행 상태와 오류를 확인합니다. migration 실패는 Compose 명령을 nonzero로 끝내고 종속 앱을 시작하지 않습니다. 자동 rollback은 없으므로 partial DDL은 DBA가 백업과 증거를 보존해 복구를 결정합니다. dev Compose에는 migrator가 없고 자동 스키마 적용도 없습니다.

### rollback

collector부터 정지하고 새 DB와 profile을 보존합니다. backend 배포를 되돌릴 때 이전 backend 이미지/config와 검증한 이전 DB 연결을 함께 복원합니다. 새 collector를 기존 DB에 연결하는 방식은 허용되지 않으며 config도 `DB_NAME=jungol_bada`만 허용합니다. 새 DB·기존 DB·MySQL data directory·profile을 삭제하거나 `down -v`를 실행하는 rollback 명령은 제공하지 않습니다. 부분 migration은 DBA가 증거와 백업을 보존한 후 별도 복구 결정을 내립니다.

## 로컬 코드 확인

저장소 root에서 다음은 실제 package script입니다. Node 22 이상 25 미만이 필요합니다. 의존성 설치에 네트워크가 필요할 수 있습니다.

```sh
npm --prefix collector ci --ignore-scripts --no-audit --no-fund
npm --prefix collector run typecheck
npm --prefix collector run lint
npm --prefix collector test
npm --prefix collector run build
node collector/dist/cli.js --help
docker build --target test -t anabada-jungol-collector-test:local collector
docker run --rm --init --ipc=host anabada-jungol-collector-test:local
```

`npm --prefix collector run test:mysql`은 별도의 일회용 DB 통합 테스트입니다. `check-config`는 환경의 필수 인증 값을 검증하되 외부 로그인/DB 접속은 하지 않습니다. credential을 읽을 수 없으면 실패가 정상입니다. `run-once`는 dry-run이 아니며 실제 Jungol 요청과 DB 쓰기를 실행합니다.

## 설정 계약

루트 `.env`의 필수 키는 `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JUNGOL_USERNAME`, `JUNGOL_PASSWORD`입니다. `VITE_KAKAO_MAP_API_KEY`와 긴급 장애 알림용 `WEBHOOK_URL`은 선택값입니다. `COLLECTOR_RUN_ONCE`은 로컬 진단 전용의 엄격한 `true`/`false` 값이며 기본값은 `false`입니다. 이 값은 GitHub Secret이나 생성되는 운영 `.env`에 포함되지 않습니다. Compose는 필요한 키만 각 서비스에 명시적으로 전달하며 `.env` 전체를 `env_file`로 주입하지 않습니다.

| 서비스 | 외부에서 전달하는 값 |
|---|---|
| MySQL | `DB_PASSWORD` → `MYSQL_ROOT_PASSWORD` |
| backend | `DB_PASSWORD`, `JWT_SECRET`, 선택 `WEBHOOK_URL` |
| middleware | `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` |
| collector | `DB_PASSWORD`, `JUNGOL_USERNAME`, `JUNGOL_PASSWORD`, 선택 `WEBHOOK_URL` |
| frontend 빌드 | 선택 `VITE_KAKAO_MAP_API_KEY` |

DB topology, Jungol HTTPS URL/그룹 1125, profile 경로 `/var/lib/jungol/profile`, 완료 후 10분 주기, worker 2개, 증분 페이지 상한 100, Jungol 업무 요청 완료 후 3초 간격, 로그인/페이지 timeout 60000/30000ms, headless 실행과 랭킹 seed `anabada`는 코드에 고정합니다. 운영 환경 변수로 조정하지 않습니다. CLI의 `run-once` 명령으로 단일 cycle을 실행합니다.

## 개발 Compose POC

[개발 Compose](../../docker-compose.dev.yaml)는 project-scoped `mysql-data`와 `jungol-profile` named volume을 사용합니다. dev 환경에는 마이그레이터를 넣지 않으며 자동으로 스키마를 생성하지 않습니다.

새 로컬 checkout에서 [환경 템플릿](../../.env.example)을 루트의 gitignore된 `.env`로 복사하고 필수 여섯 값을 채웁니다. 파일을 배포 사용자 소유, mode 0600으로 제한합니다. 실제 Jungol 인증 값도 이 파일에 입력하며 별도 secret 파일은 만들지 않습니다. MySQL, backend, collector는 동일한 `DB_PASSWORD`와 root 계정을 사용합니다.

```sh
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev config --quiet
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev up -d anabada-mysql
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev build jungol-collector
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev run --rm --no-deps jungol-collector check-config
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev run --rm --no-deps jungol-collector run-once
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev run --rm --no-deps -e COLLECTOR_RUN_ONCE=true jungol-collector start
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev up -d --build --wait
docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev ps
```

위 one-shot을 실행할 때 scheduled collector는 정지되어 있어야 합니다. `run --rm --no-deps`는 service의 `restart: unless-stopped`를 적용하지 않는 일회성 컨테이너이므로, `COLLECTOR_RUN_ONCE=true ... start`로 환경 경로를 검증해도 재시작 loop를 만들지 않습니다. POC 완료 뒤 `docker compose --env-file .env -f docker-compose.dev.yaml -p jungol-dev stop`으로 정지하면 DB/profile을 보존합니다. 전체 실행은 실제 사이트/DB를 사용하므로 secret 없는 dry setup 검증은 `config --quiet`와 build/CLI help까지만 수행합니다.

## production 파일·배포 순서

[운영 Compose](../../docker-compose.prod.yaml)와 [stage Compose](../../docker-compose.stage.yaml)는 기존 `./database/mysql_data` bind mount를 유지하고 SQL init mount를 사용하지 않습니다. 두 환경은 `mysql:9.3.0`을 사용하므로 기존 data directory의 9.3 호환성은 별도 운영 acceptance가 필요합니다. stage와 production의 external network `bada-network`, `dmoj_nginx_network`는 Compose 실행 전에 서버에 미리 존재해야 합니다. 같은 checkout에서 stage와 prod를 동시에 실행하지 않습니다. collector는 외부 포트를 열지 않으며 non-root image, init, 1GB shared memory, dropped capabilities, no-new-privileges를 사용합니다.

`jungol-profile`은 project 이름에 종속됩니다. 운영 Compose project 이름/작업 경로를 변경하면 다른 profile volume을 만들 수 있으므로 이름을 유지합니다. profile에는 인증 상태가 있으므로 백업·접근 권한을 제한하고 로그/artifact로 업로드하지 않습니다. image 기본 CMD는 `start`이며 별도 host cron/systemd timer를 추가하지 않습니다. container healthcheck 실패만으로 Docker가 자동 재시작하는 것은 아닙니다.

운영 rollout 순서:

1. 이전 backend/config 복구 경로와 DB 백업을 확보하고 기존 레거시 수집/sync 작업을 정지합니다.
2. stage에서 `COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.stage.yaml up -d --build --wait --wait-timeout 180`를 성공시킨 뒤 status SELECT와 9개 업무 테이블을 검증합니다. CI에서 확인된 구버전 Compose/Bake 조합 호환성을 위해 Bake 위임만 끄며 BuildKit 캐시·단일 `up`·migration 의존성은 유지합니다. production workflow도 `COMPOSE_BAKE=false`인 하나의 Compose `up -d --build --remove-orphans --wait` 안에서 migrator 성공 뒤에만 앱을 시작합니다.
3. GitHub production Environment에 아래 필수 secrets를 등록합니다. workflow가 서버 루트 `.env`를 생성합니다. 기존 MySQL root 비밀번호와 `DB_PASSWORD`가 일치하고 backend/collector가 `anabada-mysql:3306/jungol_bada`에 접속하는지 확인합니다.
4. `.env`와 profile 권한, external networks, MySQL image 호환성을 확인합니다. 운영자가 통제하는 단일 one-shot으로 초기 적재·점수·재실행을 검증합니다.
5. backend와 collector를 배포하고 health 및 사용자별 적재 결과를 확인합니다. 초기 empty 응답과 나중의 projection 노출을 구분합니다.
6. 아래 acceptance를 실제 운영 서버에서 완료한 후 일반 서비스 전환을 확정합니다.

운영 조회/정지 명령은 checkout root에서 실행합니다. 모든 Compose 호출은 `--env-file .env`로 루트 파일을 명시합니다. shell에 같은 이름의 변수가 export되어 있으면 `.env`보다 우선하므로 이전 배포 값이 남지 않은 shell에서 실행합니다. 비밀 값이 출력되지 않도록 config 검사는 `--quiet`로 실행합니다.

```bash
docker compose --env-file .env -f docker-compose.prod.yaml config --quiet
docker compose --env-file .env -f docker-compose.prod.yaml ps
docker compose --env-file .env -f docker-compose.prod.yaml exec -T jungol-collector node dist/cli.js healthcheck
docker compose --env-file .env -f docker-compose.prod.yaml stop jungol-collector
```

### GitHub Environment 체크리스트

[배포 workflow](../../.github/workflows/deploy.yaml)는 main push, `production` Environment, 단일 production concurrency를 사용합니다. 다음 값은 production Environment의 Secrets에 등록합니다.

| GitHub secret | 용도 |
|---|---|
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` | SSH 대상 |
| `DEPLOY_KEY` | SSH private key |
| `DB_PASSWORD` | MySQL root 초기화와 backend/collector root 접속 |
| `JWT_SECRET` | middleware/backend JWT 서명 |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | middleware 관리자 인증 |
| `JUNGOL_USERNAME`, `JUNGOL_PASSWORD` | collector Jungol 인증 |
| `VITE_KAKAO_MAP_API_KEY` | 선택 프런트엔드 빌드 키 |
| `WEBHOOK_URL` | 선택 backend/collector 긴급 Discord 장애 알림 주소 |

workflow는 필수 값을 검증하고 Compose dotenv 형식으로 서버 루트 `.env` 하나를 설치합니다. 파일 소유자는 배포 사용자이며 mode는 0600입니다. 생성한 파일을 Git/artifact/로그에 포함하거나 내용을 출력하지 않습니다. SSH 계정은 고정 checkout 경로와 Docker 접근 권한이 필요합니다. Environment protection/승인 정책과 branch protection은 GitHub 설정에서 검증합니다.

별도의 `DEPLOY_KNOWN_HOSTS` Secret은 사용하지 않습니다. GitHub Actions의 일회성 runner는 `StrictHostKeyChecking=accept-new`로 첫 SSH 연결의 host key를 자동 수락합니다. 설정은 간단하지만 사전에 등록한 fingerprint와 서버 신원을 대조하는 방식은 아니므로, production Secrets를 관리할 수 있는 권한과 배포 대상 주소를 엄격하게 제한해야 합니다.

workflow는 고정 경로에 저장소가 없으면 public `main`을 depth 1로 clone하고, Git working tree가 있으면 `main`을 depth 1로 fetch한 뒤 `origin/main`으로 hard reset합니다. 따라서 서버의 추적 코드 수정은 최신 main으로 교체됩니다. Git에 추적되지 않고 main의 추적 파일과 경로가 충돌하지 않는 `database/mysql_data` 데이터는 유지하며, workflow는 `git clean`이나 volume 삭제를 실행하지 않습니다. 기존 경로가 Git working tree가 아니면 삭제·reset·clean 없이 실패합니다. 이후 `.env` 설치, Compose validation, 단일 `up --build --remove-orphans --wait` 순서로 수행하며 migration이 실패하면 Compose가 nonzero로 끝나고 새 앱 rollout은 시작하지 않습니다.

### 안전한 secret 회전

production Environment의 해당 secret을 갱신한 뒤 검증된 배포를 실행하여 `.env` 교체와 서비스 재생성을 함께 적용합니다. 값은 터미널 명령 인자나 로그에 넣지 않고, 회전 전 복구 가능한 이전 비밀은 승인된 secret store에 보관합니다. JWT 회전은 기존 토큰을 무효화할 수 있고 관리자 인증 값 회전은 재로그인이 필요할 수 있으므로 운영 시점을 조정합니다.

`DB_PASSWORD` 값 교체는 **기존 MySQL root 비밀번호를 변경하지 않습니다**. DBA가 실제 root 비밀번호 변경과 GitHub Environment 갱신·backend/collector 재생성을 조율해야 합니다. `MYSQL_ROOT_PASSWORD`는 기존 data directory의 계정 비밀번호를 자동 갱신하지 않습니다. Jungol 로그인 인증 값 회전은 collector를 정지한 상태에서 수행하고 새 `.env` 배포 후 아래 단일 cycle로 검증합니다.

## 상태 확인과 문제 대응

`healthcheck`는 profile의 `collector-health.json`을 검사합니다. heartbeat는 30초, 허용 age는 90초이며 idle/running만 건강합니다. 실행 30분 초과 또는 degraded는 unhealthy입니다. health success는 실제 수집 최신성을 보장하지 않으므로 계정별 `corrects`, `submissions`, `solution` 증가량을 확인합니다. 자동 알림 연동 여부는 서버에서 별도 검증해야 합니다.

선택 `WEBHOOK_URL`을 설정하면 내부 순위 알림용 `hook` 테이블과 별개로 긴급 Discord 알림을 사용합니다. collector는 partial/failed cycle, 인증 만료, CAPTCHA·challenge circuit, health 기록 실패와 종료 timeout을 알립니다. backend는 기존 공통 `logger.error` 경계를 통해 요청·DB 오류를 알리며 404·validation 같은 요청 거절은 긴급 알림에서 제외합니다. 메시지는 서비스명, KST 시각, 정규화한 오류 코드, 영향과 즉시 확인 절차만 포함하며 예외 원문, 요청 query, 계정명, credential, cookie와 webhook URL은 포함하지 않습니다. 같은 서비스·오류 코드는 최초 성공 발송 뒤 30분 동안 중복 전송하지 않습니다. backend에서 발송 자체가 실패하면 오류 폭주를 막기 위해 1분 뒤 다시 시도할 수 있습니다.

긴급 웹훅은 오류를 감지한 프로세스가 살아 있어야 동작합니다. 호스트 전원·네트워크 단절, Docker daemon 장애, 즉시 OOM kill처럼 프로세스가 전송할 기회 없이 사라지는 장애는 외부 uptime/container 모니터에서 별도로 감시해야 합니다. 실제 Discord 채널에는 배포 후 통제된 오류 한 번으로 메시지 형식과 권한을 확인합니다.

backend `/health`는 제한된 시간 안에 DB 연결과 `SELECT 1`만 확인합니다. DB 접근 실패는 HTTP 503입니다. 테이블 존재 여부와 SQL 적용 여부는 검사하지 않으며 운영자의 수동 확인 책임입니다.

| 증상 | 확인/조치 |
|---|---|
| `invalid_config`, `invalid_secret` | 루트 .env의 필수 값과 해당 서비스 전달 여부 확인; 값 출력 금지 |
| `browser_failed` | profile 단일 소유자·UID 권한·Chromium 실행 의존성 확인 |
| `skipped_overlap` | 다른 collector lease 소유자와 profile 사용 프로세스 확인; 강제 lock 삭제 금지 |
| `rank_regression`, `rank_mismatch` | 부분 수집/사이트 변화/동시 제출 조사; corrects/cursor 수동 조작 금지 |
| cursor/page/parser 오류 | 페이지 상한과 응답 계약을 테스트 fixture로 재현; payload 원문 로그 금지 |
| 일부 사용자만 반영됨 | 실패한 사용자의 corrects와 solution이 이전 값인지 확인하고 다음 cycle 재시도를 확인 |
| 점수 없는 반복 이벤트 AC | solved-count trigger 한계를 먼저 확인 |

### 인증/circuit 복구

인증 실패, CAPTCHA/challenge 또는 403/429가 보이면 scheduled collector를 먼저 정지합니다. 사이트 문제를 빈 데이터로 간주하거나 cursor를 전진시키지 않습니다. 다른 브라우저가 같은 profile을 열지 않도록 컨테이너와 세션 종료를 확인합니다. 운영자는 권한이 제한된 display 환경에서 같은 image/profile로 로그인 또는 challenge를 직접 처리한 다음 브라우저를 정상 종료합니다. 배포 이미지에는 noVNC/display 서버나 자동 CAPTCHA 해결 기능이 포함되지 않습니다. headless 설정은 코드에 고정되어 있으므로 수동 브라우저 복구 환경은 운영자가 별도로 준비합니다.

`auth_required` 또는 `manual_recovery_required` 상태가 되면 `CollectorService`의 **메모리 내 circuit**이 열려 이후 cycle과 로그인 요청을 멈추고 unhealthy heartbeat를 유지합니다. 브라우저/profile은 stop 시 닫힙니다. 영속 circuit 파일이나 `reset-circuit` CLI는 없으며 프로세스 재시작으로 circuit이 초기화됩니다. 따라서 원인을 해결하기 전 반복 재시작하지 않습니다. 일반 오류나 감지되지 않은 403/429가 이 circuit으로 분류된다고 가정하지 않습니다. 그런 경우 운영자가 서비스를 정지해 재시도를 중단합니다.

인증/profile 권한 등 원인을 복구한 뒤, scheduled collector가 정지한 상태에서 아래 순서로 config, 실제 단일 cycle, 상시 실행을 확인합니다. 첫 명령은 config만 검사하고 두 번째는 실제 요청/쓰기입니다. 마지막 `up`은 stopped service를 시작하여 메모리 circuit을 초기화합니다. 임의의 profile lock/cookie 파일 삭제를 복구 명령으로 사용하지 않습니다.

```bash
docker compose --env-file .env -f docker-compose.prod.yaml run --rm --no-deps jungol-collector check-config
docker compose --env-file .env -f docker-compose.prod.yaml run --rm --no-deps jungol-collector run-once
docker compose --env-file .env -f docker-compose.prod.yaml up -d jungol-collector
```

## 운영 acceptance

- [ ] stage 자동 migration 성공 및 migrations status SELECT 확인; production rollout 전 unmanaged DB/checksum 실패가 없는지 확인.
- [ ] backend와 collector의 DB host/port/name 확인; 동일 root 계정과 DB_PASSWORD 사용 확인.
- [ ] legacy 수집기/기존 sync scheduler 비활성화; collector 단일 replica.
- [ ] 실제 서버에서 non-root Chromium, secrets, profile 재사용 및 컨테이너 재생성 확인.
- [ ] 긴 이력 pagination, cursor 도달, AC-only와 rejected cursor 전진, 재실행 멱등성 검증.
- [ ] 사용자 실패 시 cursor/점수 rollback, 다른 사용자 commit 유지, projection 복구 검증.
- [ ] KST 일일 1점/이벤트 기간·생성일·추가일/지연 AC/반복 AC 한계 확인.
- [ ] health·오류 알림과 인증/circuit 복구를 실제 서버에서 확인.
- [ ] 운영 증거는 건수·익명화 오류 코드만 보존; credential/쿠키/핸들/HTML/BSON/개인 로그 제외.
