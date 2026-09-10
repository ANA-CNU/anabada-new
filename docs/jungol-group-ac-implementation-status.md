# Jungol 그룹 AC 수집 구현 상태

## 현재 최종 결과

group AC 수집·정산 durable one-cycle은 `exit=0`, `status=success`로 끝났다.
rank, initialization, cutoff은 각각 15이고 ledger는 225이며 tier/counter match는
15다. baseline automatic award는 0, checkpoint는 idle, inbox는 0, migrations는 2와
3, cleanup은 true였다.

원장에 삽입된 실제 AC는 11개다. 이 11개는 과거 overlap을 포함할 수 있으므로 cutoff
이후의 신규 풀이, 신규 점수 지급, 또는 award 11건과 동의어로 단정하지 않는다.
`successUserCount=2`는 새로 초기화된 전체 15명이 아니라 해당 cycle의 AC 정산 대상
사용자 수다.

user 정책은 group-rank numeric `acRating`을 existing 32-tier mapper의 유일한 입력으로
사용하는 것이다. profile은 new user historical solved-list initialization에만 사용한다.
image filename, screenshot, blank/dash/next-tier UI는 rating contract가 아니며 `0`으로
해석하지 않는다.

## 흐름별 검수

| 흐름 | 현재 확인 결과 |
| --- | --- |
| membership / initialization | rank member 15명을 초기화했고 group wire `u`는 rank login handle과 12개 표본에서 대응했다. `u`는 numeric account ID가 아니라 handle key다. |
| group AC scan / resume | 실제 endpoint, `result=AC`, opaque cursor, `more`, checkpoint resume/finalize가 durable one-cycle 경로에서 사용됐다. |
| settlement / daily / event | ledger, tier/counter, checkpoint idle, inbox zero가 durable proof와 DB fixture에서 확인됐다. 실제 live AC 11개에 대한 score/award 의미는 별도로 단정하지 않는다. |
| user transaction / inbox checkpoint | retry settlement, inbox/checkpoint finalization, original error 보존 및 failed connection destroy 경계를 검수했다. |
| cache / projection / manual | month filter, all-user lock/zero cache, manual score와 관리 user 보존 경계를 검수했다. |
| error / shutdown | typed cursor error가 `PageOperation`을 지나 보존되고 cleanup true로 one-cycle이 종료됐다. |
| runtime wiring | `SyncCycle` group-cycle을 포함한 durable one-cycle이 success로 완료됐다. |

## 검증

- collector final serial: 총 99개 중 98 pass, expected DB skip 1, fail 0
- collector typecheck, lint, build, `git diff --check` pass; lint의 info 2개는 기존 정보성 항목
- backend unit 68 pass, backend typecheck/build pass
- disposable MySQL 9.3에서 backend SQL operation/API suite 상위 2개와 noop 1개 pass
- migrations unit 15 pass, migrations typecheck/lint/build pass
- actual migrator integration 및 composable startup order exit 0

missing-score 및 fixture-specific score semantics 검증은 disposable MySQL fixture에서
수행한 결과다. 이는 durable live proof가 individual live AC마다 어떤 score/award를
지급했는지 증명하는 결과와 혼동하지 않는다.

## 운영 주의

운영 승인, production deployment, production DB에서 migration `003` 실행은 아직
수행하지 않았다. `003_group_ac_scoring.sql`의 automatic collection/projection reset은
production 적용 전 별도 backup, 데이터 보존 범위 검토, 운영 승인 절차를 거쳐야 한다.

초기 browser timeout과 empty-header fixture failure는 이미 해결된 harness/fixture 조사
이력이다. 후속 trace와 durable run은 실제 endpoint 및 response body 경로를 확인했으며,
해당 이력은 API 부재를 뜻하지 않는다.
