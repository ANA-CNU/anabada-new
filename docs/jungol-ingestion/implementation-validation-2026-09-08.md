# Jungol collector 구현 검증 기록

기준 브랜치는 `codex/jungol-ingestion`이다. 운영 DB, `main`, production container에는 변경을 적용하지 않았다. 이 문서는 fixture와 일회용 container 결과만 기록하며 실제 운영 IP의 Jungol 접근 성공을 대신하지 않는다.

## 당시 구현의 검증 결과 (역사 기록)

아래 수치와 컨테이너 검증은 단일 `.env` 전환 전 실행한 당시 증거입니다. 당시 파일 기반 인증 및 제한 권한 계정 검증은 현재 운영 설정 지침이 아닙니다. 현재 계약은 [운영·개발 가이드](./README.md)와 루트 [.env.example](../../.env.example)을 따릅니다.

| 표면 | 실행 결과 |
|---|---|
| TypeScript | `npm run typecheck`, `npm run lint`, `npm run build` 성공 |
| 순수·생명주기 테스트 | 66개 성공, 실패·skip 없음 |
| Playwright Linux test image | 79개 중 77개 성공, MySQL 전용 2개만 의도적으로 skip, 실패 없음 |
| MySQL 8.4 일회용 container | 사용자/점수/메타데이터/cursor/projection 22개 시나리오 성공 |
| Compose | dev, stage, prod 모두 `config --quiet` 성공 및 collector 보안·secret·volume 계약 검사 성공 |
| production image | Compose build 성공, 실행 사용자는 `pwuser`, entrypoint와 healthcheck 확인, file-backed secret으로 `check-config` 성공 |

MySQL 검증에는 다음 경계가 포함된다.

- 확정된 9테이블 SQL 적용
- 신규 계정 해결 목록의 synthetic baseline(`1970-01-01T00:00:01Z`, `external_submission_id=NULL`)과 초기 daily/event 점수 0점
- 증분 반복 AC 두 건 저장과 이벤트 점수 1건
- 외부 submission ID 및 award key 충돌 검증
- 동일 입력 재처리 멱등성
- attempt, score, user counter, cursor, 월 캐시의 사용자 단위 rollback
- 해결 수가 같은 사용자의 네 metadata 컬럼만 갱신
- advisory lock 중복 실행 방지
- projection 실패 후 다음 실행 복구
- 문서와 동일한 collector 권한으로 정상 적재
- collector 권한에서 DDL과 DELETE 거부

Playwright test image 검증에는 로그인 필요 화면, 잘못된 로그인, CAPTCHA, Turnstile/Cloudflare, rank header drift, 중복 account ID, submission pagination/cursor, 반복 cursor, malformed BSON, 삭제한 language/metric 필드가 없는 wire 응답, HttpOnly session을 보존한 persistent profile 재실행이 포함된다.

## 현재 설정 계약

현재는 루트 `.env` 하나에 `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JUNGOL_USERNAME`, `JUNGOL_PASSWORD`를 지정하며 `VITE_KAKAO_MAP_API_KEY`와 긴급 Discord 알림용 `WEBHOOK_URL`은 선택입니다. GitHub production Environment의 Secrets로 배포 workflow가 서버 루트 `.env`를 생성합니다. MySQL, backend, collector는 동일한 root 비밀번호를 사용하며 collector에는 `DB_PASSWORD`, `JUNGOL_USERNAME`, `JUNGOL_PASSWORD`, 선택 `WEBHOOK_URL`만 직접 전달합니다. 모든 Compose 명령에 `--env-file .env`를 명시합니다.

## 아직 운영자가 확인해야 하는 항목

당시 회전된 Jungol credential과 승인된 dev DB 접속 정보가 작업공간에 없었으므로 실제 `jungol.co.kr` 대상 `run-once`는 실행하지 않았다. 대화에 노출된 기존 비밀번호를 재사용하지 않는다. 운영 또는 승인된 dev 환경에서 다음을 완료해야 live POC가 끝난다.

1. 로컬은 루트 `.env`에 필수 여섯 값을 준비하고, 운영은 GitHub production Secrets를 등록하여 workflow가 루트 `.env`를 생성하도록 한다. 파일 권한 0600과 대상 MySQL root 비밀번호 일치를 확인한다.
2. dev Compose는 자동 적용하지 않으므로 대상 dev DB의 스키마 준비는 운영자 책임으로 남는다. stage/production 일반 Compose up은 MySQL → migrator → apps를 강제하며, `migrations`의 버전·파일명·checksum이 일치하지 않거나 관리되지 않은 기존 `jungol_bada`이면 migrator가 실패하고 종속 앱은 시작하지 않는다.
3. scheduled collector가 정지된 상태에서 `check-config`, `run-once`, 동일 `run-once` 재실행을 수행한다.
4. rank 사용자 수, AC-only 행, `corrects`, `submissions`, `solution`, daily/event 점수와 중복 0건을 SQL로 확인한다.
5. 같은 named profile volume으로 container를 재생성해 로그인 유지 여부를 확인한다.
6. 로그에 credential, cookie, HTML/BSON 원문이 없는지 확인한다.

상세 명령과 운영 중단·복구 조건은 [운영·개발 가이드](./README.md)를 따른다.
