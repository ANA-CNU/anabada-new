# Jungol Linux container POC 결과

> 과거 POC 증거입니다. 현재 구현 및 운영 절차는 [운영 가이드](./README.md)를 따릅니다. 실제 운영 서버 검증을 대신하지 않습니다.

실행일: 2026-09-07  
결과: 성공  
목적: Linux container의 headless Chromium에서 Jungol 전용 계정 로그인과 ANA 그룹 접근이 가능한지 확인

## 실행 환경

- Docker Engine 29.4.0
- Docker server OS: Linux
- Docker server architecture: ARM64
- Host container runtime: OrbStack
- Base image: `mcr.microsoft.com/playwright:v1.63.0-noble`
- Built image ID: `sha256:12dc219396755c9f1d9a6eae8ab09ee6e21bc04f1e8b47ff0758bb897bda8963`
- Built image size: 951,913,179 bytes
- Browser: Playwright Chromium
- Container user: `pwuser`
- Browser mode: `headless: true`
- Container options: `--rm --init --ipc=host --user pwuser`
- Browser profile: container 내부 `/tmp/jungol-poc-profile`
- Host persistent volume: 사용하지 않음
- screenshot/HAR/trace: 생성하지 않음
- DB write: 수행하지 않음

## 실행 결과

```json
{
  "ok": true,
  "runtime": {
    "platform": "linux",
    "architecture": "arm64",
    "headless": true
  },
  "loginPerformed": true,
  "groupSubmission": {
    "tableRowsIncludingHeader": 17,
    "numericSubmissionCount": 13,
    "collapsedPlusNRows": 7,
    "loadMoreVisible": true
  },
  "groupRank": {
    "tableRowsIncludingHeader": 13,
    "uniqueAccountCount": 12
  },
  "sessionSurvivedBrowserRestart": true
}
```

## 증명된 내용

- Linux ARM64 container에서 Playwright Chromium이 headless로 실행됐다.
- 제공된 전용 계정의 아이디/비밀번호 로그인 UI 자동화가 성공했다.
- 로그인 과정에서 CAPTCHA나 Cloudflare challenge가 나타나지 않았다.
- 로그인 후 `/group/1125/submission`의 실제 제출 행에 접근했다.
- 그룹 제출 목록에서 숫자 제출 ID 13개를 읽었다.
- `더 불러오기` 버튼이 존재했다.
- `/group/1125/rank`에서 Jungol 숫자 account ID 12개를 읽었다.
- 첫 Chromium persistent context를 정상 종료하고 같은 container/profile 경로로 새 Chromium을 시작해도 로그인 세션이 유지됐다.
- 컨테이너 실행은 exit code 0으로 종료됐다.
- 자격 증명 없이 실행한 별도 failure-path 검증은 Jungol/Chromium을 시작하기 전에 `missing_credentials`로 exit code 1을 반환했다.

## 아직 증명되지 않은 내용

- 실제 운영 Linux 서버의 공인 IP에서도 Cloudflare가 같은 방식으로 통과하는지
- container 자체를 제거·재생성한 뒤 host persistent volume으로 인증이 유지되는지
- Docker Compose secret 파일을 사용한 credential injection
- `+N` 표기가 가리키는 제출/재채점 데이터의 정확한 의미
- `더 불러오기`를 반복한 전체 페이지네이션과 cursor 중단
- 화면에 날짜가 생략된 최신 제출의 정확한 timestamp 획득 방법
- 브라우저 내부 first-party API 응답의 안정적인 스키마
- DB 멱등 적재, 강제 종료 복구, 점수 중복 방지
- Chromium sandbox 활성 상태의 명시적 runtime 증거

따라서 “container에서는 동작하지 않아 일반 데스크톱 브라우저가 필수”라는 가설은 현재 POC에서 반박됐다. 적어도 이 Linux ARM64 container 환경에서는 headless Chromium만으로 로그인과 그룹 데이터 접근이 가능하다. 다만 Cloudflare 판정은 IP와 실행 환경에 따라 달라질 수 있으므로 최종 운영 서버에서 같은 POC를 다시 실행해야 한다.

## 보안 기록

- 자격 증명은 Git 파일, Dockerfile, image layer, environment variable, 명령 인자에 기록하지 않았다.
- 로그인 profile은 임시 container filesystem에만 있었으며 `--rm` 종료와 함께 제거됐다.
- 첫 도구 실행에서 PTY가 stdin을 echo해 로컬 작업 실행 로그에 자격 증명이 반복 노출됐다.
- 이후 POC 실행 안내는 terminal의 비밀번호 입력을 숨기고 non-TTY stdin으로 전달하도록 수정했다.
- 해당 계정을 운영에 사용할 경우 POC 완료 후 비밀번호를 교체하고 새 값은 Docker secret으로만 배포한다.

## 다음 POC

1. 실제 운영 Linux 서버에서 동일 image를 실행한다.
2. host의 전용 persistent volume을 mount하고 container 재생성 뒤 인증 유지를 확인한다.
3. Docker Compose secret 두 개로 credential을 주입한다.
4. Playwright network response 관찰로 `더 불러오기`와 `+N`의 실제 payload를 확인한다.
5. 수집 데이터는 fixture 파일 또는 POC 전용 DB에만 쓰고, production DB에는 아직 쓰지 않는다.

## 후속 통합 POC 상태

같은 날 [랭킹→worker→DB 통합 POC](./rank-worker-db-poc-2026-09-07.md)를 추가로 완료했다.

- `+N`은 연속된 같은 사용자·문제 제출 grouping으로 확인했다.
- DOM 10행에서 encrypted BSON 원본 20개 submission ID를 복원했다.
- 별도 `jungol_bada` MySQL에 20건을 멱등 적재했다.
- 무변경 skip, 해결 수 증가 worker, cursor 중단, 강제 오류 rollback을 확인했다.

따라서 위 “아직 증명되지 않은 내용” 중 `+N` 해석과 DB 멱등 적재는 후속 문서의 증거로 해소됐다. 운영 서버 IP, container 재생성 persistent volume, Docker secret mount, 실제 2페이지 이상 계정은 여전히 남아 있다.
