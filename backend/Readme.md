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

The event integration tests require an **empty disposable MySQL database**. They create and drop `event` and `event_problem` tables and an injected-failure trigger, so do not point them at a shared or production database.

```bash
TEST_DATABASE_URL=mysql://root:password@127.0.0.1/backend_qa bun test
```

Without `TEST_DATABASE_URL`, the input unit tests run and the MySQL integration suite is explicitly skipped. The integration suite checks existing HTTP response fields, transactional rollback on create/update/delete failures, concurrent updates, malformed input, and retained membership timestamps.
