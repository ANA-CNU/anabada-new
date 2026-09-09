# 문서 QA 기록 (2026-09-08)

범위: `docs/jungol-ingestion/` 문서. production 서버 접속·실제 자격 증명 사용·외부 쓰기는 하지 않았습니다.

- [x] 이전 README 본문을 `planning-2026-09-07.md`에 보존하고 역사 기록 배너 추가. 기존 두 POC 문서도 증거 본문을 유지하고 최신 가이드 링크 추가.
- [x] 새 가이드의 클래스·단계·환경 키를 `collector/src/`, 활성 migration, Compose 및 workflow와 대조.
- [x] 후속 `CollectorService` auth/manual-recovery circuit 및 backend DB 연결 health 구현을 다시 읽고 메모리 circuit/재시작 복구/HTTP 503 설명 반영. circuit이 persistent file이라고 주장하지 않음.
- [x] local Markdown 상대 링크 존재 및 code fence 짝 검사 통과.
- [x] 명시된 npm script가 실제 `collector/package.json`에 존재함을 검사.
- [x] `npm --prefix collector run build` 통과, `node collector/dist/cli.js --help` 실행 및 현재 CLI 확인.
- [x] secret 없이 `check-config` 실행 시 exit 1과 `invalid_config` 반환. 브라우저/DB 작업 전에 실패하는 dry setup 경계 확인.
- [x] 당시 Docker Compose v5.1.2에서 dev/stage/prod `config --quiet` 통과. 이 기록의 수동 적용 전제는 이후 delivery에서 대체되었다.
- [x] 현재는 `migrations` 버전·파일명·SHA-256 checksum을 기록하는 전용 migrator와 disposable MySQL/image·Compose startup-order CI 검증을 사용한다. dev Compose만 자동 적용하지 않으며 stage/prod 일반 Compose up은 MySQL → migrator → apps를 강제한다.
- [x] 문서 SQL 명령은 `jungol_bada` 생성/조회만 수행. 기존 `anabada`를 수정하거나 삭제하는 실행 명령 없음. rollback은 stop/preserve 정책이며 DB/volume 삭제 명령 없음.
- [x] 새 문서에는 실제 credential, cookie, handle, HTML/BSON payload 없음. 비밀 할당 패턴 검사와 수동 code block 검토 수행. 과거 POC는 비식별 건수·제출/account 숫자 증거를 보존.
- [x] 후속 최소 권한 검증: 문서의 SQL role/grant를 직접 추출하여 network-none/tmpfs MySQL 8.4에 적용. 비밀번호 없는 synthetic 계정의 `problem`, `score_history` 첫 insert 및 `ON DUPLICATE KEY UPDATE id=id` 재실행 성공; 각 테이블 1행 유지 확인. `problem.verdict`, `score_history.bias` UPDATE와 두 테이블 DELETE 모두 권한 오류 1142/1143으로 거부 확인. `UPDATE(id)`만 추가하여 no-op 권한을 제한.
- [x] 후속 QA 컨테이너 `jungol-docs-grants-qa-20260908` 제거 및 docker 목록에서 부재 확인. tmpfs 데이터 폐기; 별도 파일/네트워크 생성 없음.

미검증: 실제 운영 서버 IP, Linux secret 권한, persistent profile 재생성, 운영 Compose 실행/least-privilege 접속, 실제 긴 계정의 pagination, live score/event/projection, 알림 연동. 모두 [운영 acceptance](./README.md#운영-acceptance) 항목으로 남김. 문서 작업에서 코드/runtime-only 구현 검증은 N/A이며 관련 테스트 소유자의 증거와 구별함.
