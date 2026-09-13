# 점수 종류와 지급 기준

`score_history.rule_type`은 코드가 점수 종류를 구분하는 값이며 `desc`는 사람이 읽는 사유입니다.

| 타입 | 생성 주체 | 기준 |
| --- | --- | --- |
| `custom` | backend 관리자 점수 API | 관리자가 직접 지급하거나 차감한 점수 |
| `daily` | collector | 최초 해결·tier 조건을 만족하며 제출일의 KST 날짜에 daily가 없을 때 +1 |
| `event` | collector | 원 제출시각의 이벤트 자격을 충족할 때 사용자·이벤트·문제별 +1 |

관리자 `POST /api/score-history/bulk`는 클라이언트가 타입을 선택하지 않고 backend가
`custom`으로 저장합니다. 이벤트나 문제를 연결해도 관리자 지급이면 `custom`입니다.
관리자 수정 API는 점수·사유 등을 변경할 뿐 자동 점수의 타입을 custom으로 바꾸지 않습니다.
관리자 점수 변경과 월간 캐시 갱신은 기존과 같이 같은 transaction에서 수행됩니다.

daily 중복 여부는 사용자별 `rule_type='daily'`의 `score_day`로 판단합니다.
같은 날 custom/event를 받은 사실은 daily 지급을 막지 않습니다. 사유 문자열로 타입을 추측하지 않습니다.
custom에는 자동 점수용 `award_key`와 `score_day`가 필요 없고 양수·음수 점수를 사용할 수 있습니다.

004 이전 관리자 타입은 `manual`이었습니다. 004가 기존 이력을 보존하며 custom으로 전환합니다.
적용된 002/003 및 당시 검증 문서의 manual 표기는 역사 기록이며 수정하지 않습니다.

## 연결 회귀 테스트

`sh backend/test/run-mysql.sh`는 일회용 MySQL에 실제 migration을 적용한 뒤 기존
SQL/API 테스트와 `backend/test/cross/custom-daily.test.ts`를 순서대로 실행합니다.
backend 관리자 HTTP 처리와 collector `GroupRuntime.runAtomic()`은 같은 DB를 쓰되
각 서비스의 실제 pool·repository·점수 정책·transaction·캐시 구현을 사용합니다.
정올 네트워크 입력만 고정 fixture로 대체하며 운영 계정·웹훅은 사용하지 않습니다.

- custom 가점/감점 이후 같은 KST 날짜의 daily와 event 각각 지급
- 같은 제출 재처리 및 같은 날 다른 문제 해결 시 daily 중복 지급 방지
- backend에서 조회·수정·삭제한 custom과 collector 자동 점수의 캐시 합계 검증
- collector 점수 INSERT 실패 시 해당 cycle 전체 rollback, 이전 custom 보존, 재시도 성공

`node scripts/database/test-migrator-integration.mjs`는 별도 일회용 MySQL에서
004의 첫 ALTER 후, 데이터 UPDATE 후, 마지막 ALTER 후(적용 이력 INSERT 전)에
실제 migrator 실행 컨테이너를 SIGKILL합니다. 원본 SQL은 바꾸지 않으며 테스트
connection adapter가 SQL 문장 완료 시점에만 멈춥니다. 이후 정식 runner 재실행으로
점수·사유·FK·캐시 보존, custom 전환 완료, 이력 1회 기록, CHECK 제약 유지까지 검증합니다.
이는 문장 사이의 프로세스 중단 검증이며 MySQL 서버 자체의 전원 장애나 DDL 실행 중
스토리지 장애를 시뮬레이션하는 테스트는 아닙니다.

두 실행 명령은 기존 CI 경로에 연결되어 있습니다. 테스트 컨테이너와 임시 DB는 종료 시 정리됩니다.
