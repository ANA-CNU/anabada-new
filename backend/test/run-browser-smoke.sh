#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
cd "$repository_dir"

project="anabada_browser_smoke_$$"
compose="docker compose -p $project -f backend/test/docker-compose.browser-smoke.yaml"
cleanup() {
  $compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

rm -rf test-output/frontend-smoke
mkdir -p test-output/frontend-smoke
$compose config >/dev/null
$compose up --build -d --wait --wait-timeout 90 anabada-mysql
mysql() {
  $compose exec -T anabada-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --default-character-set=utf8mb4 -uroot "$@"' mysql "$@"
}
printf '%s\n' 'CREATE DATABASE anabada CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;' | mysql
mysql anabada < migrations/legacy/001_new_schema.sql
if ! $compose up --build -d --wait --wait-timeout 150 bada-nginx; then
  $compose logs jungol-migrator browser-smoke-seed anabada-backend anabada-frontend minio
  exit 1
fi
# Linux CI의 bind mount는 runner 소유이므로 같은 UID/GID로 테스트 산출물을 기록한다.
$compose run --build --rm --no-deps --user "$(id -u):$(id -g)" browser-smoke
