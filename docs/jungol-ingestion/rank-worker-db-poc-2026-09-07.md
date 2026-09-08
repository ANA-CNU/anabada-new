# Jungol 랭킹→worker→DB 통합 POC

> 과거 POC는 모든 결과 20건을 저장했습니다. 현재 구현은 AC-only이며 10분 컨테이너 내부 scheduler를 사용합니다. 아래 운영 권장값은 당시 제안이고, 최신 절차는 [운영 가이드](./README.md)를 따릅니다. POC 증거를 운영 서버 검증으로 간주하지 마세요.

실행일: 2026-09-07  
결과: 성공  
범위: 그룹 1125의 랭킹 대조, 단일 사용자 worker, 전체 채점 시도 복원, `jungol_bada` transaction 적재

## 결론

Linux ARM64 Docker 컨테이너의 headless Chromium만으로 요청한 수집 흐름을 실행할 수 있다. 일반 데스크톱 브라우저는 필수가 아니다.

```text
/group/1125/rank
        │ account ID + solved count
        ▼
jungol_bada.user와 대조
        │ 신규 또는 rank.solved > db.corrects
        ▼
bounded worker queue (POC 동시성 2)
        │ 사용자마다 Playwright page 1개
        ▼
/account/{accountId}/submission
        │ 실제 /api/submission 응답
        │ X-Fp 반복 XOR → BSON decode
        ▼
마지막 commit submission ID까지 역방향 수집
        │ 네트워크 수집을 먼저 완료
        ▼
사용자 1명 = MySQL transaction 1개
        ├─ problem attempt INSERT IGNORE
        ├─ user.corrects/submissions 갱신
        └─ user.solution cursor 갱신 후 COMMIT
```

기존 애플리케이션 DB에는 쓰지 않았다. 별도 `jungol_bada` database를 일회용 MySQL 8.4 컨테이너에 만들고 검증 후 폐기했다.

## 실제 Jungol 데이터 표면

- 그룹 랭킹 구성원: 12명
- 안정 식별자: `/account/{숫자 ID}`의 숫자 account ID
- 대상 계정: `153884`
- 대상의 랭킹 해결 수: 3
- 사용자 submission DOM 행: 헤더 제외 10행
- 원본 submission API 목록: 20건
- 원본 submission ID 범위: `13545194`–`13628739`
- 서로 다른 문제: 10개

### `+N`의 의미

Jungol submission 화면은 연속된 같은 사용자·같은 문제 제출을 묶는다. route 번들의 그룹 계산은 인접 항목의 사용자 필드 `u`와 문제 필드 `p`가 같으면 대표 ID별 카운트를 증가시킨다.

대상 화면에서는 5개 대표 행에 `+1`, `+3`, `+4` 등이 표시됐고 숨은 수의 합은 10이었다. DOM 대표 행 10개와 숨은 제출 10개를 합친 실제 목록은 20개였다.

따라서 DOM의 `<tr>` 한 개를 attempt 한 건으로 저장하면 안 된다. POC는 페이지가 실제 사용한 `/api/submission` 응답을 Playwright network event로 받고, 요청 헤더의 `X-Fp`를 반복 XOR 키로 적용한 뒤 BSON을 역직렬화했다. 이 방식으로 각 submission ID를 독립된 attempt로 복원했다.

응답에서 확인한 주요 원본 필드는 다음처럼 매핑된다.

| 원본 | 저장 필드 | 예시/단위 |
|---|---|---|
| `id` | `external_submission_id` | Jungol submission ID |
| `p` | `problem` | 숫자 문제 ID |
| `r` | `raw_result_text`, 정규화 `verdict` | `AC`, `RE` 등 |
| `s` | `score` | 부분 점수가 있으므로 `DECIMAL(10,6)` |
| `d` | `runtime_ms` | 밀리초 |
| `m` | `memory_kb` | KB |
| `b` | `code_length_bytes` | byte |
| `a` | `language` | `JAVA15` 등 실행 환경 |
| `t` | `time` | Unix epoch milliseconds |

API는 공식 공개 계약으로 문서화된 것이 아니므로 이 매핑은 drift 감시 대상이다. 필수 필드가 사라지거나 BSON 해석이 실패하면 해당 worker는 commit하지 않고 실패해야 한다.

## DB 구조

POC 스키마는 기존 이름을 최대한 유지했다.

- database: `jungol_bada`
- `user`: 기존 사용자 필드 + `jungol_account_id`, 랭킹/동기화 시각
- `problem`: 기존 문제/시도 필드 + `user_id`, `external_submission_id`, 원본 결과와 실행 메타데이터
- `sync_run`: 실행 결과와 작업량
- storage engine: InnoDB
- 멱등 키: `problem.external_submission_id UNIQUE`
- 사용자 identity: `user.jungol_account_id UNIQUE`
- cursor: `user.solution = 마지막으로 commit한 Jungol submission ID`

## 실행 결과

### 1. 신규 사용자

```json
{
  "rankAccountCount": 12,
  "changedAccountCount": 12,
  "selectedWorkerCount": 1,
  "scannedAttemptCount": 20,
  "insertedAttemptCount": 20,
  "pageCount": 1,
  "cursorReached": true,
  "committedCursor": "13628739"
}
```

DB 결과:

- 사용자 `corrects=3`
- 사용자 `submissions=20`
- 사용자 `solution=13628739`
- attempt 20행
- distinct `external_submission_id` 20개
- 부분 점수 `77.777778` 보존
- 같은 문제의 accepted와 runtime error를 서로 다른 attempt로 보존

### 2. 변경 없는 재실행

같은 DB에 다시 실행했을 때 대상은 랭킹 해결 수와 DB 해결 수가 같았다.

```json
{
  "changedAccountCount": 11,
  "selectedWorkerCount": 0,
  "results": []
}
```

나머지 11명은 POC에서 아직 적재하지 않아 전체 변경 수에는 포함됐지만, `POC_TARGET_ACCOUNT_ID=153884`로 제한한 대상 worker는 생성되지 않았다.

### 3. 해결 수 증가 감지와 cursor

임시 DB에서 대상의 `corrects`만 3에서 2로 낮춰 `rank.solved > db.corrects`를 재현했다.

```json
{
  "selectedWorkerCount": 1,
  "scannedAttemptCount": 0,
  "insertedAttemptCount": 0,
  "cursorReached": true,
  "committedCursor": "13628739"
}
```

worker는 생성됐지만 첫 API batch에서 기존 cursor를 만나 중단했고, 중복 행을 만들지 않은 채 DB 해결 수를 랭킹 값 3으로 복구했다.

### 4. 사용자 transaction rollback

일회용 DB의 `problem` INSERT에 `poc_forced_failure`를 발생시키는 trigger를 잠시 추가하고 cursor를 0으로 만들어 전체 재적재를 시도했다.

- collector exit code: 1
- worker 오류: `poc_forced_failure`
- 기존 attempt: 20행 유지
- distinct submission ID: 20개 유지
- transaction 안에서 갱신하려던 사용자 해결 수와 cursor는 commit되지 않음
- `sync_run`만 별도 실패 상태로 기록

검증 뒤 trigger를 제거했다.

## 구현 기록

당시 POC 구현물은 검증 완료 후 현재 `collector/` 기반 운영 수집기로 대체되었으며, 2026-09-08에 저장소에서 제거됐다. 위 검증 결과는 설계 기록으로만 유지한다.

## 검증 범위와 남은 위험

검증 완료:

- Linux container, non-root `pwuser`, `headless: true`
- 자동 로그인 및 그룹 랭킹 12명
- 랭킹 신규/해결 수 증가 diff
- worker 동시성 제한 구조
- DOM grouping을 우회한 실제 attempt 20건 복원
- 정확한 millisecond timestamp와 fractional score
- external submission ID 멱등성
- 마지막 submission ID cursor
- 사용자 단위 transaction rollback

아직 운영 전 검증 필요:

- 실제 운영 Linux 서버 공인 IP의 Cloudflare 판정
- Docker secret 파일 입력과 host persistent profile 재사용
- 제출이 20건을 넘는 계정에서 실제 `더 불러오기` 2페이지 이상 진행
- 403/429와 challenge circuit breaker
- 모든 Jungol 결과 코드의 정규화 fixture
- 기존 점수·이벤트 projection 이식과 중복 지급 방지
- 랭킹 기반 trigger가 놓치는 wrong-only 제출의 주기적 안전망

## 운영 권장값

- 실행: systemd timer가 one-shot container를 5분마다 호출
- profile: 계정 전용 persistent volume + `flock` 단일 writer
- 초기 worker 수: 2
- 사용자 수집 최대 페이지: 정상 주기 20, 초기 backfill은 별도 job으로 더 크게 설정
- DB transaction: 네트워크 수집 중에는 열지 않고, 사용자 한 명의 데이터가 완성된 뒤 짧게 수행
- failure: 한 worker가 실패하면 그 사용자의 cursor를 전진시키지 않음
- secret: `/run/secrets/jungol_username`, `/run/secrets/jungol_password`
- 로그: account ID, 건수, cursor, 오류 코드만 기록하고 credential/cookie/handle/응답 본문은 기록하지 않음
