#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
renderer="$script_dir/render-production-env.sh"
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
required=(DB_PASSWORD JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD JUNGOL_USERNAME JUNGOL_PASSWORD)
keys=("${required[@]}" VITE_KAKAO_MAP_API_KEY WEBHOOK_URL)
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
fixture=$' fixture # $INERT ${INERT:?do-not-expand} single\' double" slash\\ literal\\n tab\t tail\\ '
for key in "${keys[@]}"; do export "$key=$fixture"; done
export INERT=must-not-be-substituted

# Given all runtime values, when rendered, then only the contract keys are written privately.
bash "$renderer" "$test_dir/production.env" >"$test_dir/stdout" 2>"$test_dir/stderr" || fail 'valid render'
[[ ! -s "$test_dir/stdout" && ! -s "$test_dir/stderr" ]] || fail 'renderer must remain silent on success'
[[ $(wc -l < "$test_dir/production.env") -eq 8 ]] || fail 'exactly eight lines'
cut -d= -f1 "$test_dir/production.env" > "$test_dir/keys"
printf '%s\n' "${keys[@]}" > "$test_dir/expected-keys"
cmp -s "$test_dir/keys" "$test_dir/expected-keys" || fail 'exact key allowlist'
mode=$(stat -c '%a' "$test_dir/production.env" 2>/dev/null || stat -f '%Lp' "$test_dir/production.env")
[[ "$mode" == 600 ]] || fail 'mode 0600'
cp "$test_dir/production.env" "$test_dir/original"
pass 'valid input produces exactly eight keys, no logs, mode 0600'

# Given an existing artifact, when required input is absent/empty or has CR/LF, then preserve it.
for key in "${required[@]}"; do
  for invalid in missing empty; do
    if (if [[ "$invalid" == missing ]]; then unset "$key"; else export "$key="; fi
        bash "$renderer" "$test_dir/production.env") >"$test_dir/stdout" 2>"$test_dir/stderr"; then
      fail "$key $invalid accepted"
    fi
    cmp -s "$test_dir/original" "$test_dir/production.env" || fail 'failed validation replaced output'
    [[ ! -s "$test_dir/stdout" ]] || fail 'failure wrote stdout'
    if grep -Fq 'do-not-expand' "$test_dir/stderr"; then fail 'failure leaked fixture'; fi
  done
done
for key in "${keys[@]}"; do
  for invalid in $'bad\rvalue' $'bad\nvalue'; do
    if (export "$key=$invalid"; bash "$renderer" "$test_dir/production.env") >"$test_dir/stdout" 2>"$test_dir/stderr"; then
      fail "$key CR/LF accepted"
    fi
    cmp -s "$test_dir/original" "$test_dir/production.env" || fail 'CR/LF failure replaced output'
    if grep -Eq 'bad|value' "$test_dir/stderr"; then fail 'failure leaked malformed fixture'; fi
  done
done
pass 'each required key missing/empty and every key with CR/LF fail while preserving output'

# Given optional input omitted, when rendered, then it is explicitly empty.
(unset VITE_KAKAO_MAP_API_KEY WEBHOOK_URL; bash "$renderer" "$test_dir/optional.env")
grep -Fqx 'VITE_KAKAO_MAP_API_KEY=""' "$test_dir/optional.env" || fail 'optional default is not empty'
grep -Fqx 'WEBHOOK_URL=""' "$test_dir/optional.env" || fail 'optional webhook default is not empty'
# Given an optional Discord-compatible webhook, when rendered, then its exact value is retained without logs.
webhook_fixture='https://discord.com/api/webhooks/000000000000000000/placeholder-not-live'
export WEBHOOK_URL="$webhook_fixture"
bash "$renderer" "$test_dir/webhook.env" >"$test_dir/stdout" 2>"$test_dir/stderr" || fail 'optional webhook render'
[[ ! -s "$test_dir/stdout" && ! -s "$test_dir/stderr" ]] || fail 'optional webhook render leaked logs'
grep -Fqx "WEBHOOK_URL=\"$webhook_fixture\"" "$test_dir/webhook.env" || fail 'optional webhook did not round trip'
if bash "$renderer" >"$test_dir/stdout" 2>"$test_dir/stderr"; then fail 'missing path accepted'; fi
if bash "$renderer" "$test_dir/production.env" extra >"$test_dir/stdout" 2>"$test_dir/stderr"; then fail 'extra arguments accepted'; fi
if bash "$renderer" "$test_dir/missing/production.env" >"$test_dir/stdout" 2>"$test_dir/stderr"; then fail 'missing directory accepted'; fi
mkdir "$test_dir/destination-directory"
if bash "$renderer" "$test_dir/destination-directory" >"$test_dir/stdout" 2>"$test_dir/stderr"; then fail 'directory destination accepted'; fi
[[ -z $(find "$test_dir" -name '.production-env.*' -print) ]] || fail 'temporary file leak'
pass 'optional default, argument validation, write failures, and temporary cleanup'

for outcome in failure interruption; do
  if (
    if [[ "$outcome" == failure ]]; then
      mv() { return 1; }
    else
      mv() { kill -TERM "$$"; }
    fi
    export -f mv
    bash "$renderer" "$test_dir/production.env"
  ) >"$test_dir/stdout" 2>"$test_dir/stderr"; then
    fail "replacement $outcome unexpectedly succeeded"
  fi
  cmp -s "$test_dir/original" "$test_dir/production.env" || fail "replacement $outcome changed output"
  [[ -z $(find "$test_dir" -name '.production-env.*' -print) ]] || fail "replacement $outcome leaked temporary file"
done
chmod 0644 "$test_dir/production.env"
bash "$renderer" "$test_dir/production.env"
mode=$(stat -c '%a' "$test_dir/production.env" 2>/dev/null || stat -f '%Lp' "$test_dir/production.env")
[[ "$mode" == 600 ]] || fail 'replacement retained insecure old mode'
pass 'failed rename and TERM preserve old output and clean temporary files; replacement resets mode'

# Given hostile fake values, when Compose parses the artifact, then match direct shell input JSON.
printf 'services:\n  probe:\n    image: busybox:latest\n    environment:\n' > "$test_dir/compose.yaml"
for key in "${keys[@]}"; do printf '      %s: ${%s}\n' "$key" "$key" >> "$test_dir/compose.yaml"; done
printf '' > "$test_dir/empty.env"
docker compose --project-name env-render-test --env-file "$test_dir/empty.env" -f "$test_dir/compose.yaml" config --format json > "$test_dir/expected.json" 2> "$test_dir/compose-stderr"
(unset "${keys[@]}"; docker compose --project-name env-render-test --env-file "$test_dir/production.env" -f "$test_dir/compose.yaml" config --format json) > "$test_dir/actual.json" 2> "$test_dir/compose-stderr"
cmp -s "$test_dir/expected.json" "$test_dir/actual.json" || fail 'Compose exact round trip'
[[ ! -s "$test_dir/compose-stderr" ]] || fail 'Compose emitted warnings'
pass 'Docker Compose JSON exact round trip for spaces, #, $, interpolation, quotes, backslashes, and tab'

for fixture in '\' '\\' "'" '"' '$$${INERT}' $'\\\'\\"\\$\\' $'\b\f\t'; do
  for key in "${keys[@]}"; do export "$key=$fixture"; done
  bash "$renderer" "$test_dir/production.env" > "$test_dir/stdout" 2> "$test_dir/stderr"
  [[ ! -s "$test_dir/stdout" && ! -s "$test_dir/stderr" ]] || fail 'edge case render leaked logs'
  docker compose --project-name env-render-test --env-file "$test_dir/empty.env" -f "$test_dir/compose.yaml" config --format json > "$test_dir/expected.json" 2> "$test_dir/compose-stderr"
  (unset "${keys[@]}"; docker compose --project-name env-render-test --env-file "$test_dir/production.env" -f "$test_dir/compose.yaml" config --format json) > "$test_dir/actual.json" 2> "$test_dir/compose-stderr"
  cmp -s "$test_dir/expected.json" "$test_dir/actual.json" || fail 'Compose edge case round trip'
  [[ ! -s "$test_dir/compose-stderr" ]] || fail 'Compose edge case warning'
done
pass 'seven additional Compose round trips cover trailing slashes, lone quotes, adjacent dollars, and controls'
