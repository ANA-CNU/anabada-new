# Jungol 그룹 AC 피드 계약 POC 기록

실행 일시: 2026-09-10 (KST)

## 범위와 안전 조건

- 대상은 `https://jungol.co.kr/group/1125/submission?result=AC`의 첫 응답과 단 한 번의 `더 불러오기`였다.
- 로컬 `.env`의 Jungol 로그인 자격 증명은 메모리에서만 `node:util`의 `parseEnv`로 읽었다. 비밀값, 쿠키, 원문 HTML, BSON 본문은 출력하거나 저장하지 않았다.
- 단일 headless persistent Chromium context와 단일 임시 profile을 사용했고, 요청 coordinator의 직렬화/정착 후 3초 간격을 사용했다.
- DB, Docker, webhook, AI 호출, 제품 코드, 스키마 및 git 이력은 변경하지 않았다.

## 실제 관측 결과

최종 내구성 실행의 안전한 단계 기록은 다음과 같다.

```
POC_START pid=32432 profile=<임시 profile>
POC_LAUNCHED
POC_LOGIN_OK
POC_ERROR stage=group_first code=timeout
POC_CLEANUP profileRemoved=true elapsedMs=41829
POC_TERMINAL_EXIT=1
```

즉 Chromium 실행과 로그인까지는 성공했으나, 로그인 뒤 `group_first` 단계에서 기대한 `/api/submission` 응답을 기다리다 41,829 ms에 timeout으로 종료했다. 이는 사이트 API가 존재하지 않는다는 결론이 아니다. 이 POC의 해당 페이지 탐색에서 관측 대기 조건을 만족하는 응답을 확보하지 못했다는 사실만 의미한다.

## 미충족 계약 항목

응답 본문을 실제로 획득하지 못했으므로 아래 항목은 **미확정**이다.

- 첫 페이지와 한 번의 load-more의 raw BSON 필드명/자료형
- actor 계정 ID 필드의 정확한 shape
- 제출 ID의 페이지 내/페이지 간 내림차순 계약
- paging cursor의 자료형과 `more` 의미
- 같은 actor의 같은 문제 반복 제출 여부
- account `133924`의 73 대 50 문제 목록 완결성 및 전체 목록 fetch 방식
- 전역 profile의 AC rating / `Unrated` 표시 계약

따라서 기존 collector의 `wire.ts`가 `{id,p,r,s,t}`만 해석하고 actor를 버린다는 구현 사실은 유지하되, 이 기록은 actor wire 계약이나 profile 요약 파서 변경의 근거로 사용할 수 없다.

## 정리 확인

- POC Node PID `32432`는 실행 종료 후 부재를 확인했다.
- 해당 임시 Chromium profile은 접근 불가 상태로 제거됨을 확인했다.
- POC 임시 스크립트와 임시 sanitized 로그도 제거했다.
- 임시 리소스 외의 변경은 이 문서뿐이다.

## 보정: 실제 그룹 페이지 탐색 증거 (2026-09-10 KST)

이후의 단일 bounded Chromium 진단은 기존 timeout의 원인을 페이지 탐색 실패로
해석할 수 없음을 확인했다. 이 실행은 source TypeScript의 `JungolSession`과
`JungolRequestCoordinator`를 사용했으며, private temporary profile 하나만
사용했다. listener는 로그인 전부터 등록되었고, same-origin 요청은 method,
pathname, status, resource type 및 content-type 분류만 기록했다. 인증 정보,
쿠키, request/response 본문, query 값, raw HTML은 저장하지 않았다.

| 관측 항목 | 결과 |
| --- | --- |
| 로그인 | 성공 |
| 최종 AC URL document navigation | pathname `/group/1125/submission`, HTTP 200 |
| challenge / CAPTCHA marker | 없음 |
| page error | 0개 |
| 표시 테이블 | 1개, header 9개 |
| data-ready 첫 snapshot | 37 rows, empty-state 아님 |
| 한 번의 load-more 뒤 snapshot | 76 rows |
| 관련 데이터 경로 | `GET /api/group/1125/submission` — HTTP 200, fetch, `text/plain` |
| 페이지 data 경로 | `GET /group/1125/submission/__data.json` — HTTP 200, fetch, `application/json` |

따라서 이전 POC의 `waitForResponse('/api/submission')` timeout은 **잘못된 정확
경로 대기 조건**이었다. 실제 관측된 그룹 데이터 경로는 `/api/group/1125/submission`
이며, 해당 응답의 content-type은 `text/plain`이었다. 이 실행에서는 response body를
해석하지 않았으므로 BSON/텍스트 wire schema와 actor field 계약은 여전히 미확정이다.

실행은 180초 AbortSignal 및 owned-PID watchdog로 bounded 했고 exit code 0으로
끝났다. 실행 종료 후 temporary profile의 부재와 owned Node PID의 부재를 별도로
확인했다. 이 문서 외의 지속적 산출물은 남기지 않았다.

## 후속 contract probe의 실패 증거 (2026-09-10 KST)

그룹 BSON actor/paging 및 profile contract를 확인하기 위한 후속 read-only probe는
계정 데이터를 수집하지 못했다. 이 결론은 API 계약 부재가 아니라, 최초 그룹 auth
probe navigation의 준비 상태 실패에 한정된다.

| 단계 | 안전하게 관측된 결과 |
| --- | --- |
| 최초 그룹 auth probe | `domcontentloaded` 대기 중 `TimeoutError` |
| catch 시 최종 page pathname | `/group/1125/submission` |
| catch 시 login form / login-required marker | 둘 다 보이지 않음 |
| catch 시 table row 수 | 0 |
| explicit sign-in form 단계 | 도달하지 못함 |
| profile / actor / paging / rating 계약 | 미확정 |

초기의 두 probe는 `LOGIN_BEGIN` 뒤 collector의 안전 오류 코드
`browser_failed`로 종료했다. 후속 instrumentation은 그 내부 원인이 **그룹 auth
probe navigation timeout**임을 보였다. 따라서 `ensureLogin()`이 DOMContentLoaded
직후 login marker를 너무 일찍 읽어 false-authenticated branch를 택한다는 가설은
이번 관측으로 확인되지 않았다. navigation 자체가 완료되지 않았으므로 regression
fixture나 production 변경은 추가하지 않았다.

각 probe는 독립 temporary profile, 180초 deadline, owned PID watchdog을 사용했고
정상 cleanup marker를 남겼다. 본 문서 반영 뒤 probe source와 task-owned temporary
profiles/log directories를 제거했다. 인증 정보, raw response/request body, account
ID, cursor 값, username은 이 기록에 저장하지 않았다.

## 보정: encrypted BSON 구조의 최소 계약 (2026-09-10 KST)

승인된 단일 Chromium probe는 listener를 group navigation 전에 등록하고, 실제
`GET /api/group/1125/submission` 응답의 `X-Fp` request fingerprint로 XOR 복호화한
뒤 BSON을 메모리에서만 key/type tree로 검사했다. 원문 BSON, 복호화 본문, header 값,
cookie, 계정/제출 값은 기록하지 않았다. 첫 화면 table row는 37, 정확히 한 번의
`더 불러오기` 뒤에는 76이었다. 이 probe의 terminal exit는 0이었고 owned temporary
profile은 cleanup에서 제거되었다.

두 응답의 list item key/type 집합은 같았다(순서만 다름).

```
data.list[] = {
  p: number, id: number, r: string, s: number, d: number, m: number,
  u: string, l: string, t: number, c: null, i: boolean, b: number, a: string
}
data.paging = { type: string, cursor: string, more: boolean }
```

`r`은 UI query의 `result=AC`와 함께 관측되어 result code 후보이고, `p`, `id`,
`s`, `t`는 기존 decoder의 problem/submission/score/time 후보와 type이 호환된다.
그러나 `u:string`은 actor 후보일 뿐 **numeric Jungol account ID라는 의미는 아직
검증되지 않았다**. `d`, `m`, `b`, `a`, `l`, `c`, `i`도 이름이나 의미를 추정하지
않는다. `paging.cursor`와 `paging.more`는 opaque wire control로 취급해야 하며,
query parameter를 발명해 재개하면 안 된다.

같은 authenticated profile navigation에서 account `133924`의 initial solved-problem
link count는 50이었고 solved card 안에는 rendered label `expand_more`를 가진
non-problem button 하나가 관측되었다. same-origin `GET /api/gets`도 관측되었다.
이는 50-link UI가 complete set이라는 근거가 아니며, expand control의 click 결과나
API schema는 아직 durable result로 확보되지 않았다. Profile screen에서 exact text
selector로 `AC 레이팅` 또는 `Unrated`는 관측되지 않았으므로 rating을 0으로
대체하는 구현은 금지된다.

## 보정: group actor·cursor 및 profile complete-list 증거 (2026-09-10 KST)

후속 bounded 계약 검증은 실제 group wire의 `u`가 rank row의 login handle과
대응함을 12개 member 표본에서 확인했다. 이 결과는 `u`를 numeric account ID로
해석하는 근거가 아니라, rank에서 이미 해석된 account ID에 연결하는 handle key로만
사용할 수 있다는 근거다. adapter는 이 대응이 전 member에 대해 성립하지 않으면
중단해야 한다.

group continuation은 실제 UI가 생성한 request의 `result=AC`와 opaque `cursor`
parameter를 사용했을 때만 관측됐다. cursor 값·본문·header는 기록하지 않았으며,
다른 parameter를 추정하거나 cursor를 생성해서는 안 된다.

동일 profile의 solved card는 initial link 50개에서 button click 뒤 73개가 됐다.
확장 control의 rendered DOM text는 `expand_more`였지만 접근성 이름은 별도이므로,
계약 selector는 solved-card 범위 안의 button을 rendered text로 좁혀야 한다. 이
증거는 73개 완결 link 목록과 `href=/problem/<positive integer>`/직접 text ID의
일치를 확인하는 근거다.

## 보정: public profile rating surface 관측 (2026-09-10 KST)

자격 증명 없이 public profile 하나를 단일 headless context에서 읽는 120초 bounded
probe는 launch, navigation, profile readiness, parse 단계 모두 통과했고 temporary
profile을 제거했다. DOM rating-label 구조, inline script bootstrap, same-page JSON
API, 그리고 request `X-Fp`를 사용한 in-memory XOR/BSON 응답에서 allowlisted
`ac_rating`/`rating` key의 primitive value를 검사했다. 이 관측 surface에서는
explicit numeric 또는 numeric-parseable string current-rating field가 발견되지
않았다.

이는 **테스트한 public profile surface에 대한 관측**일 뿐, 사이트의 다른 endpoint,
인증 상태, 또는 향후 페이지 버전에 rating field가 없다는 일반 명제가 아니다. 따라서
현재 profile의 dash/다음-tier presentation을 `0` 또는 Unrated로 변환하는 adapter는
만들지 않는다. 정산에 rating이 필요하면 별도로 검증된 source와 user-approved
unrated policy가 필요하다.
