# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## Verification

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

The backend serves HTTP APIs only. Source collection runs in the separate collector process.

## 랭킹 보드 발행

`ranking_boards.is_active`는 수집기가 아닌 관리자가 발행 상태를 선택하는 값이다. 수집기는 새 월별 스냅샷을 항상 `is_active=0`으로 추가하며, 이미 존재하는 보드의 발행 상태를 변경하지 않는다. 활성 보드가 없으면 `/api/ranking/selected-month-board`는 빈 결과를 반환한다. 최신 수집 스냅샷을 조회하는 랭킹 API와 관리자가 발행한 보드는 서로 독립적이다.

관리 API는 관리자 인증을 요구한다.

- `GET /api/admin/ranking-boards?page=1&limit=10`
- `GET /api/admin/ranking-boards/:id`
- `PATCH /api/admin/ranking-boards/:id/active` with `{ "is_active": true | false }`

The event integration tests require an **empty disposable MySQL database**. They create and drop `event` and `event_problem` tables and an injected-failure trigger, so do not point them at a shared or production database.

```bash
TEST_DATABASE_URL=mysql://root:password@127.0.0.1/backend_qa bun test
```

Without `TEST_DATABASE_URL`, the input unit tests run and the MySQL integration suite is explicitly skipped. The integration suite checks existing HTTP response fields, transactional rollback on create/update/delete failures, concurrent updates, malformed input, and retained membership timestamps.
