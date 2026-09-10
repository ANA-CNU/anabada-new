# Jungol 그룹 AC 흐름 검토 기록

## 현재 최종 결과

durable one-cycle은 `exit=0`, `status=success`로 완료됐다. rank/initialization/cutoff는
각각 15, ledger는 225, tier/counter match는 15, baseline automatic award는 0,
checkpoint는 idle, inbox는 0, migrations는 2·3, cleanup은 true다.

원장에 삽입된 실제 AC 11개는 과거 overlap을 포함할 수 있다. 따라서 이를 cutoff 이후
신규 풀이, 신규 점수 지급, 또는 award 11건으로 단정하지 않는다.
`successUserCount=2`는 initial initialization 15명 전체가 아니라 AC 정산 대상 사용자 수다.

rank의 numeric `acRating`은 existing 32-tier mapper의 유일한 입력이다. profile은 new
user historical solved-list initialization 전용이다. image filename, screenshot,
blank/dash/next-tier UI는 rating source가 아니며 `0`으로 해석하지 않는다.

## 흐름별 검수

| 흐름 | 검수 결과 |
| --- | --- |
| membership / initialization | rank 15명과 initialization/cutoff 15를 확인했다. `u`는 rank login handle과 12개 표본에서 대응하는 actor key다. |
| group AC scan / resume | 실제 group endpoint, AC result filter, opaque cursor, `more`, checkpoint resume/finalize가 one-cycle에서 동작했다. |
| settlement / daily / event | ledger 225, tier/counter 15 match, baseline award 0을 확인했다. live AC 11개별 score/award 의미는 단정하지 않는다. |
| user transaction / inbox checkpoint | settlement retry, original error 보존, failed connection destroy, inbox/checkpoint finalization을 검수했다. |
| cache / projection / manual | month filter, zero cache, all-user lock, manual score와 관리 user 보존 경계를 검수했다. |
| error / shutdown | typed cursor error 보존과 cleanup true를 확인했다. |
| runtime wiring | group-cycle을 포함한 `SyncCycle` runtime one-cycle이 success로 끝났다. |

## 검증

- collector final serial: 99 total, 98 pass, expected DB skip 1, fail 0
- collector typecheck/lint/build/`git diff --check` pass; lint info 2개는 기존 항목
- backend unit 68 pass 및 backend typecheck/build pass
- disposable MySQL 9.3 backend SQL operation/API top 2와 noop 1 pass
- migrations unit 15 및 migrations typecheck/lint/build pass
- actual migrator integration과 composable startup order exit 0

missing-score와 fixture-specific score semantics는 disposable MySQL fixture에서 검증한
경계다. durable live proof의 individual AC score/award 의미로 확대하지 않는다.

## 운영 주의

운영 승인, production deployment, production migration `003` 실행은 수행하지 않았다.
`003` reset은 production 적용 전 별도 backup, 보존 범위 검토, 운영 승인 절차가 필요하다.

초기 browser timeout과 empty-header fixture failure는 해결된 harness/fixture 조사
이력이다. 후속 trace와 durable run은 실제 endpoint/body 경로를 확인했으며 이는 API
부재의 증거가 아니다.
