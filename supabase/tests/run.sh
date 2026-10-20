#!/usr/bin/env bash
# Requires a local PostgreSQL 17 superuser via the standard PG* environment.
# Refuses to replace an existing database; removes the database it creates.
set -euo pipefail
export LC_ALL=C
here="$(cd "$(dirname "$0")" && pwd)"
test_db="${TEST_DB:-claro_sql_test}"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
createdb -- "$test_db"
trap 'dropdb --if-exists -- "$test_db"; rm -f "$log"' EXIT

apply() {
  if ! psql -Xq --dbname="$test_db" --set=ON_ERROR_STOP=1 --file="$1" >"$log" 2>&1; then
    echo "FAIL $1" >&2
    cat "$log" >&2
    return 1
  fi
}

apply "$here/bootstrap.sql"
for file in "$here"/../migrations/*.sql; do
  apply "$file"
done
for file in "$here"/*.test.sql; do
  apply "$file"
  echo "ok $(basename "$file")"
done
