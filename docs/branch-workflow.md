# 개발 브랜치와 배포 통합 절차

이 저장소의 일상 개발 기준 브랜치는 `dev`다. 기능 개발부터 검증, 리뷰, 운영 반영까지의
경로를 명확히 분리하여, 검증되지 않은 변경이 운영 배포 경로에 직접 들어가지 않게 한다.

## 브랜치 역할

| 브랜치 | 역할 | 자동화 |
| --- | --- | --- |
| `dev` | 통합 개발 기준선. 모든 일반 개발 작업의 시작점과 push 대상 | push 시 검증 CI 실행 |
| 작업 브랜치 | 필요할 때 `dev`에서 만든 기능·수정 단위 브랜치 | push 시 검증 CI 실행 |
| `main` | 리뷰와 CI를 통과한 변경만 반영하는 운영 기준선 | push 시 production 배포 workflow 실행 |

`main`에 직접 push하거나 `main`에서 일반 기능 작업을 시작하지 않는다. production 배포는
`main`에 반영된 commit만 대상으로 하며, `dev` 또는 작업 브랜치의 push는 배포하지 않는다.

## 일반 개발 흐름

1. 최신 `dev`에서 작업을 시작한다. 작은 변경은 `dev`에서, 독립적인 기능·수정은
   `dev`에서 작업 브랜치를 만들어 진행할 수 있다.
2. 변경 범위에 맞는 테스트와 정적 검사를 실행한다. 실패한 상태로 통합하지 않는다.
3. 의도와 검증 단위를 분명히 하는 작은 commit을 만든다. 비밀값, 개인 브라우저 profile,
   로컬 DB 데이터, 생성된 credential 파일은 commit하지 않는다.
4. 작업 브랜치를 사용했다면 `dev`를 대상으로 PR을 열고, 검토와 CI 성공 뒤 병합한다.
   `dev`에서 직접 작업한 경우에도 push 뒤 CI 결과를 확인한다.
5. `dev`에서 출시할 변경이 준비되면 GitHub에서 **head: `dev`, base: `main`**인 PR을
   연다. 코드 리뷰와 CI가 모두 통과한 뒤에만 병합한다.

```text
dev ──> 작업 브랜치 ──> PR ──> dev ──> PR ──> main ──> production 배포
      (선택)          리뷰·CI             리뷰·CI
```

## `main` 변경을 `dev`에 반영하기

`main`에 병합된 변경은 `dev`에도 반영해 다음 개발의 기준선을 최신 상태로 유지한다.
원격 정보를 가져온 뒤 `origin/main`을 `dev`에 **merge 또는 fast-forward** 한다.

```sh
git switch dev
git fetch origin
git merge --ff-only origin/main
git push origin dev
```

`--ff-only`가 실패하면 `dev`에 아직 `main`에 없는 작업이 있으므로, 상태를 확인한 뒤
의도적으로 merge commit을 만들거나 해당 작업을 먼저 통합한다. `dev`를 `reset`으로
`main`에 맞추거나 force-push하지 않는다. 이 절차는 `main`을 수정하거나 배포를 실행하지
않는다.

## 운영 배포 경계

- GitHub Actions 검증 workflow는 `main`을 제외한 branch push와 pull request에서 실행된다.
- production deployment workflow는 `main` push에서만 실행되며 production Environment의
  승인·보호 규칙과 Secrets를 사용한다.
- PR의 검토·CI 성공은 `main` 직접 push의 대체가 아니다. 운영 반영은 반드시 승인된
  `dev` → `main` PR 병합으로 수행한다.
- 배포 중 문제나 운영 DB 변경은 이 브랜치 절차와 별도로, 승인된 운영 절차와 백업·검증
  기준을 따른다.
