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
$compose run --rm --no-deps jungol-migrator
$compose run --rm --no-deps browser-smoke-seed
$compose up --build -d anabada-backend anabada-frontend anabada-middleware bada-nginx
$compose run --rm --no-deps browser-smoke
