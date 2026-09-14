# Jungol 멤버 소스 및 005 운영 런북

## 현재 계약

멤버 스냅샷의 권위는 `/group/1125` article 안의 정확한 **소유자**와 **멤버**
영역의 합집합이다. `/group/1125/rank`는 전체 멤버 명부가 아니므로 신규 멤버 탐색이나
원시 AC Rating의 입력으로 사용하지 않는다. 저장·정산에 전달하는 값은 `accountId`,
`jungolName`, `tier`뿐이며, 005 적용 시 `ac_rating` 열은 제거된다.

구현은 [group-members.ts](../collector/src/jungol/group-members.ts)에서 멤버 heading이
있는 article을 선택한 뒤, 정확한 `소유자`·`멤버` heading 각각의 다음 element sibling만
다음 heading 전까지 읽는다. 두 영역의 로딩 버튼이 사라지고 유효한
`/account/<숫자>` 링크가 준비될 때까지 기다린다. heading 밖 링크와 다른 heading 뒤의
링크는 포함하지 않는다. 같은 account ID가 두 영역에서 같은 이름·tier로 반복되면 하나로
합치고, 둘 중 하나라도 다르면 `duplicate_account`로 실패한다. 소유자 heading이 없는
기존 그룹 페이지도 멤버 영역만으로 계속 읽는다.
각 멤버의 이미지 중 정확히 `/solved/N.svg` (`N=0..31`)은 numeric tier로 읽고,
공식 `/solved/sprout-1.svg`은 tier `0`으로 읽는다. 다른 사이트 badge 이미지는 무시하고,
tier 이미지가 없으면 정상적인 tier `0`을 사용한다. 다만 그 밖의 공식 `/solved/` 경로,
빈 값·범위 밖·복수 tier 이미지는 `invalid_group_members`로 실패하며, 알 수 없는 형식을
0으로 바꾸지 않는다.

정산은 [account-settlement.ts](../collector/src/account-settlement.ts)에서 이 snapshot의
`member.tier`를 `DailyScorePolicy`에 직접 전달한다. 별도 raw rating 변환이나 DB
`ac_rating` 저장은 없다. 한 cycle의 commit은
[cycle-commit.ts](../collector/src/application/cycle-commit.ts)에서 모든 멤버의
`jungol_name`과 `tier`를 새로 고치며, 관리자 관리 필드(`korean_name`, `ignored`,
`rank_wrong_count`)는 이 metadata refresh가 변경하지 않는다.

신규 멤버만 profile의 전체 solved 목록을 기준선으로 초기화한다. profile은 tier의
출처가 아니며, 초기화는 중복 없는 모든 solved 문제를 저장하고 그 개수로
`corrects`와 `submissions`를 확정한다. 멤버 이미지가 없는 경우의 tier `0`은 이
초기화에도 그대로 전달된다.

## 005 적용 순서

005는 `user.ac_rating`만 삭제하므로 새 backend/collector를 시작하기 전에 적용해야
한다. stage와 production에서 환경 파일에 맞춰 다음 순서를 사용한다.

1. `COMPOSE_BAKE=false docker compose --env-file .env -f docker-compose.stage.yaml config --quiet`
   또는 `docker-compose.prod.yaml`으로 설정을 확인한다.
2. 같은 환경 파일로 `docker compose ... build`를 완료한다.
3. `docker compose ... stop anabada-backend jungol-collector`만 실행한다.
4. `docker compose ... up -d --no-build --remove-orphans --wait --wait-timeout 180`으로
   migrator 성공 뒤 앱을 시작한다.
5. `docker compose ... restart bada-nginx` 후 `docker compose ... ps`를 확인한다.

MySQL 컨테이너와 데이터 디렉터리는 중지·삭제·초기화하지 않는다. 자동 rollback은
없으므로 적용 전 백업이 필요하다.

## 검증과 현재 증거 한계

로컬 계약 검증 명령은 다음과 같다.

```sh
cd collector
npm test
npm run typecheck
npm run lint
npm run build
# `test:mysql`는 현재 `test:group:mysql` 별칭이다.
npm run test:mysql

cd ..
node seeds/test.mjs
sh backend/test/run-mysql.sh
```

브라우저 fixture는 [group-members-browser.test.ts](../collector/test/group-members-browser.test.ts),
실제 MySQL group 통합은 [group-mysql-integration.mjs](../collector/test/group-mysql-integration.mjs),
backend/collector cross 검증은 [custom-daily-fixture.ts](../backend/test/cross/custom-daily-fixture.ts)에
있다.

초기 POC에는 login 전 challenge로 중단된 실행이 있었지만, 최신 read-only 실제 브라우저
계약 실행은 로그인을 완료했다. 소유자를 포함해 27명의 멤버를 읽었고, account 339의
solved 목록은 표시·scoped DOM·collector 반환 모두 1902개로 일치했다. 같은 실행에서
AC hover 절대 KST timestamp, feed pagination, 문제 metadata tier도 통과했다. 이 실행의
민감정보 없는 aggregate 증거는
`/private/tmp/jungol-live-owner-members-db51c061-d9e8-4565-af7b-77768236b880.json`에 남아
있다.

실제 그룹 DOM에서는 account `148259`를 포함하는 정확한 `소유자` heading과 그 뒤의
정확한 `멤버` heading이 관측됐으며, 멤버 영역에는 다른 26명의 사용자가 있었다.
두 영역 밖의 소개글 등 임의 account link는 수집하지 않는다. numeric tier 외에
`/solved/sprout-1.svg`도 관측됐고, 이 공식 경로 하나는 tier 0으로 확정한다. 다른
비숫자·범위 밖 `/solved/` 경로와 복수 tier 이미지는 계속 실패한다. 단일 공개 사용자명
관측은 임시 진단에만 사용했으며 이 문서에는 저장하지 않았다.

현재 Linux offline collector suite는 238개 중 237개 통과, 1개 disposable DB 통합 case
skip, 0개 실패로 완료됐다. 별도 host disposable MySQL 검증은 40개 중 40개 통과했다
(`/private/tmp/owner-members-final-mysql.log`). 이는 production deployment를 수행했다는
뜻은 아니며, 이 런북의 DB 배포 절차는 별도로 따른다.
