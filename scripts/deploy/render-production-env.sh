#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

if [[ $# -ne 1 || -z "$1" ]]; then
  printf 'Usage: render-production-env.sh OUTPUT_PATH\n' >&2
  exit 1
fi
output=$1
if [[ -d "$output" ]]; then
  printf 'Output must be a file.\n' >&2
  exit 1
fi
required=(DB_PASSWORD JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD)
keys=("${required[@]}" VITE_KAKAO_MAP_API_KEY WEBHOOK_URL)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    printf 'Required environment variable is missing or empty: %s\n' "$key" >&2
    exit 1
  fi
done
for key in "${keys[@]}"; do
  value=${!key:-}
  if [[ "$value" == *$'\r'* || "$value" == *$'\n'* ]]; then
    printf 'CR/LF is forbidden in: %s\n' "$key" >&2
    exit 1
  fi
done

temporary=
cleanup() { if [[ -n "$temporary" ]]; then rm -f -- "$temporary"; fi; }
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
temporary=$(mktemp "$(dirname -- "$output")/.production-env.XXXXXXXX")
for key in "${keys[@]}"; do
  value=${!key:-}
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\$/\$\$}
  printf '%s="%s"\n' "$key" "$value"
done > "$temporary"
chmod 0600 "$temporary"
mv -f -- "$temporary" "$output"
temporary=
