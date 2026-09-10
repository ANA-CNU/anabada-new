#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$root_dir/docker-compose.seeded-preview.yaml"
env_file="$root_dir/.env"

if [ -n "${DOCKER_HOST:-}" ] && ! printf '%s' "$DOCKER_HOST" | grep -Eq '^unix://|^npipe://'; then
  echo "원격 DOCKER_HOST에서는 seeded preview를 실행할 수 없습니다." >&2
  exit 1
fi

context_name=$(docker context show)
context_endpoint=$(docker context inspect "$context_name" --format '{{.Endpoints.docker.Host}}')
if ! printf '%s' "$context_endpoint" | grep -Eq '^unix://|^npipe://'; then
  echo "로컬 Docker context에서만 seeded preview를 실행할 수 있습니다." >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "루트 .env 파일이 필요합니다. .env.example을 참고하세요." >&2
  exit 1
fi

exec env COMPOSE_PARALLEL_LIMIT=1 docker compose --project-name anabada-dev-seeded --env-file "$env_file" -f "$compose_file" up -d --build --wait --wait-timeout 180
