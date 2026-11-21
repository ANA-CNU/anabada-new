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
$compose run --rm backend-sql-test sh -c 'bunx tsc --noEmit -p test/cross/tsconfig.json && bun test test/cross/custom-daily.test.ts test/cross/webhook-registration.test.ts --timeout 30000'

mysql_test() {
  $compose exec -T anabada-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --default-character-set=utf8mb4 -uroot "$@"' mysql "$@"
}
run_with_pending_file() {
  $compose run --rm \
    -v "$repository_dir/backend/test/boj/015_fixture.sql:/app/015_fixture.sql:ro" jungol-migrator
}
# A fresh database prepares the schema and leaves the import and later files pending.
run_with_pending_file
test "$(mysql_test jungol_bada -N -e 'SELECT GROUP_CONCAT(version ORDER BY version) FROM migrations')" = '2,3,4,5,6'
test "$(mysql_test boj_bada -N -e 'SELECT COUNT(*) FROM boj_import')" = '0'
if $compose run --rm jungol-migrator node dist/cli.js up --require-boj-import; then
  printf '%s\n' 'Production migration must fail without a legacy BOJ source.' >&2
  exit 1
fi
printf '%s\n' 'CREATE DATABASE anabada CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;' | mysql_test
mysql_test anabada < migrations/legacy/001_new_schema.sql
mysql_test anabada < backend/test/boj/legacy-fixture.sql
$compose run --rm jungol-migrator node --input-type=module -e '
import { MigrationCatalog } from "./dist/catalog.js";
import { parseConfiguration } from "./dist/config.js";
import { createLogger } from "./dist/logger.js";
import { MigrationRepository, MysqlMigrationConnectionFactory } from "./dist/repository.js";
import { MigrationRunner } from "./dist/runner.js";
const catalog = await new MigrationCatalog("/app").load();
const repository = new MigrationRepository(parseConfiguration(process.env), new MysqlMigrationConnectionFactory());
await new MigrationRunner(repository, createLogger()).run(catalog.filter(({version}) => version <= 11), true);'
test "$(mysql_test jungol_bada -N -e 'SELECT GROUP_CONCAT(version ORDER BY version) FROM migrations')" = '2,3,4,5,6,7,8,9,10,11'
test "$(mysql_test boj_bada -N -e 'SELECT COUNT(*) FROM boj_solved_history')" = '3'
mysql_test boj_bada -e "UPDATE boj_solved_history SET next_page=7,solved_handle='alpha' WHERE user_id=41"
# Model a crash between the import's commit and the insertion of its checksum record.
mysql_test jungol_bada -e 'DELETE FROM migrations WHERE version>=7'
$compose run --rm jungol-migrator node dist/cli.js up --require-boj-import
test "$(mysql_test boj_bada -N -e 'SELECT CONCAT(solved_ac_history_page,":",solved_ac_handle) FROM user WHERE id=41')" = '7:alpha'
test "$(mysql_test boj_bada -N -e 'SELECT COUNT(*) FROM user WHERE solved_ac_history_page IS NOT NULL')" = '3'
test "$(mysql_test -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='boj_bada' AND TABLE_NAME IN ('boj_tier','boj_import','boj_member_admission','boj_solved_history')")" = '0'
# Replaying 012 after its DDL committed must retain the migrated progress.
mysql_test jungol_bada -e 'DELETE FROM migrations WHERE version>=12'
$compose run --rm jungol-migrator node dist/cli.js up --require-boj-import
test "$(mysql_test boj_bada -N -e 'SELECT solved_ac_history_page FROM user WHERE id=41')" = '7'
run_with_pending_file
run_with_pending_file
test "$(mysql_test jungol_bada -N -e 'SELECT GROUP_CONCAT(version ORDER BY version) FROM migrations')" = '2,3,4,5,6,7,8,9,10,11,12,13,14,15'
test "$(mysql_test jungol_bada -N -e 'SELECT id FROM migration_probe')" = '1'
mysql_test boj_bada -e 'UPDATE user SET solved_ac_history_page=0,solved_ac_handle=NULL WHERE id=41'
test "$(mysql_test -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='boj_bada' AND TABLE_NAME='migrations'")" = '0'
# The last migrator was run with the fixture mounted, so use its validated database directly.
$compose run --rm --no-deps backend-sql-test bun test test/boj/mysql.test.ts --timeout 30000
