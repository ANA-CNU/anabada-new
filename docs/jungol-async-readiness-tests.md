# Jungol 비동기 페이지 준비 상태 검수

## 검수 범위

`DOMContentLoaded`는 HTML 파싱 완료이지 Jungol 데이터 준비 완료가 아니다.
이번 검수는 브라우저 진입점과 실제 호출자 `GroupRuntimeBrowser`를 직접 읽고,
production 클래스를 import하는 HTTP fixture/Chromium 테스트로 확인했다.
정올 서버만 로컬 HTTP 서버로 대체하며 `Page`, collector, decoder를 mock하지 않는다.

| 실제 경로 | 준비 조건 및 검증 |
| --- | --- |
| `JungolSession.ensureLogin` | 빈 표로 성공하지 않음. JS 이후 인증 데이터·로그인 안내·challenge 판별 |
| `RankCollector.collect` | fetch 뒤 생성된 행과 로그인 사용자명, AC Rating/tier를 읽음 |
| `AccountProfileCollector.collectSolved` | fetch 뒤 해결 목록과 명시적 0개 처리, 50→73개 확장 fetch 대기 |
| `GroupFeedCollector.readPage` | JS 지연 시작, 그룹 전용 API, 응답 body 완료, DOM 준비, pagination cursor |
| `ProblemMetadataResolver.resolve` | 제목과 tier 준비 후 캐시, 실제 tier-image 구조, 인증/challenge/403/429 거부 |
| `GroupRuntimeBrowser` | 실제 rank/profile/feed/metadata 클래스를 조립해 초기화·rating·cursor 전달 검증 |
| 기존 `SubmissionCollector`·`SubmissionCursorCollector` | 개인 API 지연 응답 이후 원본 제출/cursor 반환 |
| 기존 `AccountSummaryCollector` | JS fetch 이후 해결 섹션만 읽음 |

## 테스트에서 발견해 수정한 결함

1. metadata가 HTML 도착 직후 DOM을 읽어 아직 없는 제목·tier를 fallback으로 캐시했다.
2. 실제 문제 제목의 `/solved/1.svg` 같은 tier 이미지를 읽지 못했고, 제목에 UI 아이콘과
   실행 제한 문구까지 포함할 수 있었다.
3. 로그인 확인에서 인증 fetch가 미완료여도 표 헤더만 있으면 성공했다.
4. metadata 후속 fetch의 HTTP 403/429 및 JS 이후 로그인/challenge 화면이 난이도
   미확인 fallback으로 처리될 수 있었다.
5. rank 로딩 행을 열 개수가 틀린 최종 행으로 즉시 판정할 수 있었다. 로딩 문구가
   사라진 후에 기존 헤더·행·숫자·사용자명 계약 검증을 수행하도록 했다.
6. 프로필 해결 수가 양수이고 링크가 아직 0개인 중간 상태에서 확장 버튼을 찾다가
   실패할 수 있었다. 첫 해결 링크가 도착한 뒤 전체 목록/확장 처리를 시작한다.

위 결함은 수정 전 실패를 먼저 확인했다. 수정 후에는 같은 테스트가 통과해야 한다.
이 재현은 제어된 fixture의 결함 증거이며, 과거 운영 timeout 원인을 확정하는 증거는 아니다.

## 테스트 구조

- `async-browser-fixture.ts`: 실제 HTTP 응답을 `FetchGate.release()`까지 보류한다.
- `async-*-browser.test.ts`: 관심 단계별 테스트와 runtime 조립 테스트를 분리한다.
- HTML 응답, JS bootstrap fetch, API 응답 헤더, BSON body, DOM 반영을 별도로 제어한다.
- Chromium이 실제 요청한 뒤에만 응답을 해제한다. 정해진 sleep 뒤 성공을 가정하지 않는다.
- 접힌 화면 행 대신 API 원본 제출·시각을 검사한다.
- 외부 HTTPS 요청은 fixture에서 차단한다. 실제 계정·DB·웹훅은 사용하지 않는다.
- 각 시나리오는 15초 상한, 서버는 임의 포트, profile은 고유 임시 경로를 사용한다.
- 종료 시 browser, 서버 연결, 임시 profile을 정리한다.

## 실행 및 CI

Chromium이 설치된 환경에서:

```bash
cd collector
node --import tsx --test --test-concurrency=1 test/async-*-browser.test.ts
npm test
npm run typecheck
npm run lint
npm run build
```

기존 CI는 Playwright Chromium 설치와 실행 확인 후 `npm test`를 수행한다.
새 파일도 기존 `test/*.test.ts` 패턴에 포함되므로 별도 optional flag나 skip 없이 실행된다.
실제 MySQL 테스트는 기존 `test:mysql`, `test:group:mysql` gate가 담당한다.

## 유지해야 할 경계

- 정답 원장·점수 정책·SQL transaction·checkpoint는 이번 변경 범위가 아니다.
- 정상적인 난이도 미확인은 기존 bounded fallback을 유지한다. 인증/요청 제한을
  정상 tier 0으로 바꾸지 않는다.
- 페이지 제한 시간을 늘리지 않았다. 준비 대기를 제거하거나 API를 잘못 지정하면
  테스트가 실패해야 한다.
- 코드 검수와 테스트 실행은 메인 에이전트가 직접 수행했다. 별도 에이전트 검수나
  운영 배포 성공으로 이 결과를 표시하지 않는다.

## 로컬 검증 증거 (2026-09-13)

- 새 비동기 브라우저 시나리오: 32개. 수정 전 metadata 조기 파싱·실제 tier-image·
  빈 표 인증·후속 fetch 거절·rank/profile placeholder 결함을 실패 테스트로 확인했다.
- 숨겨진 challenge placeholder는 인증 준비 완료를 의미하지 않는다는 경계도 포함한다.
- 테스트는 외부 응답만 대체하고 실제 Chromium과 production 클래스를 사용한다.
- 실제 정올의 제한된 compiled adapter 확인: 로그인 성공, 그룹 16명, AC 첫 페이지
  40건, 문제 1000의 tier 1 및 제목 `두 정수 더하기 (A+B)` 확인.
- DB를 요구하는 조건부 테스트는 `test:mysql`, `test:group:mysql`로 별도 실행했다.
  각각 일회용 MySQL 9.3.0만 사용하며 실행기가 해당 컨테이너를 종료·제거한다.
- production 설정, 점수 정책, migration, 운영 DB는 변경하지 않았다.
- 최종 전체 suite: 249개 중 246개 통과, 실패 0개, DB 조건부 3개 skip.
  별도 실제 MySQL 실행: SQL 31개, lifecycle 1개, 그룹/원자적 저장 25개 모두 통과.
- typecheck·lint·build 및 diff 공백 검증 통과. 기존 SQL 테스트 파일의 Biome 정보성
  안내 3개는 이번 브라우저 변경과 무관하여 그대로 유지했다.
