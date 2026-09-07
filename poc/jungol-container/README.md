# Jungol Linux container POC

이 POC는 Linux Playwright Chromium 컨테이너에서 다음만 검증한다.

- `headless: true` 자동 로그인
- ANA 그룹 제출 표 접근
- ANA 그룹 랭킹과 숫자 account ID 접근
- 그룹 제출 ID와 `더 불러오기` 표면 확인
- 동일 컨테이너 안에서 Chromium을 종료·재시작한 뒤 로그인 세션 유지

자격 증명은 파일, 이미지, environment, 명령행 인자로 받지 않는다. 프로세스의 표준 입력에서 아이디와 비밀번호를 한 줄씩 읽으며 출력하지 않는다. persistent profile은 컨테이너의 `/tmp`에만 저장되고, 컨테이너는 `--rm`으로 제거한다.

## Build

```bash
docker build -t anabada-jungol-poc:local poc/jungol-container
```

## Run

자격 증명이 terminal echo나 명령 인자에 남지 않도록 입력을 shell 변수로 잠깐 받은 뒤 non-TTY stdin으로 전달한다.

```bash
read -r -p "Jungol ID: " JUNGOL_POC_USERNAME
read -r -s -p "Jungol password: " JUNGOL_POC_PASSWORD
printf '\n'
printf '%s\n%s\n' "$JUNGOL_POC_USERNAME" "$JUNGOL_POC_PASSWORD" \
  | docker run --rm -i --init --ipc=host --user pwuser anabada-jungol-poc:local
unset JUNGOL_POC_USERNAME JUNGOL_POC_PASSWORD
```

성공 시 자격 증명이나 사용자 이름 없이 행 수와 세션 재사용 여부만 JSON으로 출력한다.

자동화/운영 구성에서는 이 수동 입력 대신 `/run/secrets/jungol_username`과 `/run/secrets/jungol_password`를 사용한다.

## Rank → worker → `jungol_bada` POC

`ingest.mjs`는 다음 흐름을 실제로 실행한다.

1. 그룹 랭킹 12명을 숫자 account ID로 읽는다.
2. `jungol_bada.user`와 비교해 신규 사용자 또는 해결 수가 증가한 사용자만 고른다.
3. 사용자마다 별도 Playwright page worker를 할당한다.
4. submission API의 encrypted BSON 원본을 해석해 UI의 `+N` grouping 안에 숨은 제출까지 복원한다.
5. 기존 `user.solution` submission ID를 만날 때까지 읽는다.
6. 한 사용자 전체를 하나의 MySQL transaction으로 저장한다.

테스트용 MySQL은 외부 port를 publish하지 않고 일회성 Docker network에서만 실행한다. 아래의 빈 root password는 이 폐쇄형 POC에서만 허용한 설정이며 운영에서는 사용하면 안 된다.

```bash
docker network create anabada-jungol-poc-net

docker run --rm -d \
  --name jungol-mysql-poc \
  --network anabada-jungol-poc-net \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=jungol_bada \
  -v "$PWD/poc/jungol-container/schema.sql:/docker-entrypoint-initdb.d/001-schema.sql:ro" \
  mysql:8.4

read -r -p "Jungol ID: " JUNGOL_POC_USERNAME
read -r -s -p "Jungol password: " JUNGOL_POC_PASSWORD
printf '\n'
printf '%s\n%s\n' "$JUNGOL_POC_USERNAME" "$JUNGOL_POC_PASSWORD" \
  | docker run --rm -i --init --ipc=host --user pwuser \
      --network anabada-jungol-poc-net \
      -e DB_HOST=jungol-mysql-poc \
      -e DB_DATABASE=jungol_bada \
      -e POC_TARGET_ACCOUNT_ID=153884 \
      -e POC_MAX_WORKERS=2 \
      -e POC_MAX_PAGES=20 \
      anabada-jungol-poc:local node ingest.mjs
unset JUNGOL_POC_USERNAME JUNGOL_POC_PASSWORD
```

`POC_TARGET_ACCOUNT_ID`는 검증 범위를 한 명으로 제한하는 POC 안전장치다. 운영에서는 제거해 변경 사용자 전체를 처리한다. `POC_MAX_WORKERS`와 `POC_MAX_PAGES`는 burst 및 무한 페이지네이션을 막는 상한이다.

Wire decoder regression test:

```bash
docker run --rm --user pwuser \
  anabada-jungol-poc:local \
  node --test auth-state.test.mjs jungol-wire.test.mjs
```

실제 결과와 한계는 [`docs/jungol-ingestion/rank-worker-db-poc-2026-09-07.md`](../../docs/jungol-ingestion/rank-worker-db-poc-2026-09-07.md)에 기록했다.
