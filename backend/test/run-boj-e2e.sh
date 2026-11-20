#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir/../.."

project="anabada_boj_e2e_$$"
compose() {
  docker compose -p "$project" -f backend/test/docker-compose.browser-smoke.yaml \
    -f backend/test/docker-compose.boj-e2e.yaml "$@"
}
trap 'compose down -v --remove-orphans >/dev/null 2>&1 || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p test-output/boj-e2e
compose up -d --wait --wait-timeout 90 anabada-mysql
mysql() {
  compose exec -T anabada-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$@"' mysql "$@"
}
printf '%s\n' 'CREATE DATABASE anabada CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;' | mysql
mysql anabada < migrations/legacy/001_new_schema.sql
compose run --build --rm --no-deps jungol-migrator node dist/cli.js up --require-boj-import

if ! compose up --build -d --wait --wait-timeout 150 bada-nginx anabada-frontend; then
  compose logs anabada-backend
  exit 1
fi
compose logs --no-color anabada-backend
compose run --build --rm --no-deps --user "$(id -u):$(id -g)" browser-smoke
