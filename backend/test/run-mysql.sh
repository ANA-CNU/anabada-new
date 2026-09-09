#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
cd "$repository_dir"

project="anabada_mysql_test_$$"
compose="docker compose -p $project -f backend/test/docker-compose.mysql.yaml"
cleanup() {
  $compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
$compose config >/dev/null
$compose up --build -d anabada-mysql
$compose run --rm jungol-migrator
$compose run --rm backend-sql-test
$compose run --rm jungol-migrator
$compose run --rm backend-sql-test bun test test/mysql/noop.test.ts --timeout 30000
