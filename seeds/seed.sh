#!/bin/sh
set -eu

if [ "${PREVIEW_SEED:-}" != "anabada-dev-seeded" ] || [ "${DB_HOST:-}" != "anabada-mysql" ] || [ "${DB_NAME:-}" != "jungol_bada" ]; then
  echo "미리보기 전용 시드 대상 검증에 실패했습니다." >&2
  exit 1
fi

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "DB_PASSWORD가 필요합니다." >&2
  exit 1
fi

export MYSQL_PWD="$DB_PASSWORD"
exec mysql --default-character-set=utf8mb4 --protocol=TCP --host="$DB_HOST" --user=root "$DB_NAME" < /seeds/preview.sql
