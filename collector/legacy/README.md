# 레거시 수집기 보관소

이 디렉터리의 `.disabled` 파일은 운영 빌드·테스트·Docker 복사 대상이 아니다.

- `src/jungol/rank.ts.disabled`와 연결된 계정 동기화 그래프는 `/group/:id/rank`와 AC Rating에 의존하므로 폐기했다.
- 운영 수집은 그룹 멤버 화면의 `accountId`, `jungolName`, `tier`와 group feed 정산 경로만 사용한다.
- 이전 rank 전용 테스트도 같은 상대 경로로 보관한다. 활성 정산·일일/이벤트 점수·MySQL 원자성 검증은 `collector/test`에 남긴다.

## MySQL 회귀 검증 이관

`legacy/test/mysql.integration.test.ts.disabled`와 `mysql-edge-cases.ts.disabled`의 rank solved-count·AC Rating·metadata refresh 검증은 폐기했다. 다음 활성 group feed 정산 검증이 실제 DB transaction 경계를 유지한다.

| 이전 회귀 범주 | 활성 검증 |
| --- | --- |
| 초기 기준선의 멱등성과 rollback | `test/group-mysql.integration.test.ts`의 group initialization/atomic rollback cases |
| AC 제출 중복, cursor, DB commit 원자성 | `test/cycle-atomic-mysql-cases.ts` |
| 일일·이벤트 점수와 재시도 멱등성 | `test/daily-missed-mysql-cases.ts`와 `test/group-mysql.integration.test.ts` |
| 권한/ignored 보존과 migration idempotency | `test/group-mysql.integration.test.ts` |
| hook endpoint·disabled 보존 | `settlement-regression-mysql-cases.ts`: `hook repository returns active endpoints and permanently disables selected endpoints` |
| cross-account submission conflict | `settlement-regression-mysql-cases.ts`: `cross-account external submission conflict rolls back the second settlement` |
| award-key different evidence conflict | `settlement-regression-mysql-cases.ts`: `same award key with different durable evidence rejects and rolls back` |
| same-account concurrent replay와 cursor ownership | `settlement-regression-mysql-cases.ts`: `same-account concurrent settlement commits one attempt and one award` |
| advisory lock second owner exclusion/release | `settlement-regression-mysql-cases.ts`: `advisory lease excludes a second owner and releases for the next owner` |
| repeated AC event award, historical KST day와 event begin | `settlement-regression-mysql-cases.ts`: `repeated AC awards one in-range event and honors historical KST day boundaries` |
| manual board projection 보존 | `test/mysql-projection-cases.ts`, `group-mysql.integration.test.ts`에서 실행 |

`npm run test:mysql`는 이제 위 활성 `group-mysql.integration.test.ts`를 실행하는 `test:group:mysql` 경로를 사용한다.
