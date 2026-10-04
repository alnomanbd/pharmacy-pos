#!/bin/bash
# Loads part of a backup into a side database, so the console can put one
# shop's data back from it without touching anybody else's.
#
#   stage.sh        reads and removes /backups/.stage-request
#
# The request, written by the API, is one setting per line:
#
#   archive=dawai-2026-10-03_0200.archive.gz
#   by=Noman
#   collection=sales
#   collection=shopproducts
#   ...
#
# Only those collections are loaded, into "<database>_restore", which the API
# emptied before asking. Writes /backups/.stage.json as it goes.
set -uo pipefail

DIR=${BACKUP_DIR:-/backups}
URI=${MONGODB_URI:-mongodb://mongo:27017/dawai}
REQ="$DIR/.stage-request"
STATUS="$DIR/.stage.json"

[ -f "$REQ" ] || exit 0
archive=$(sed -n 's/^archive=//p' "$REQ" | head -n 1)
by=$(sed -n 's/^by=//p' "$REQ" | head -n 1)
mapfile -t collections < <(sed -n 's/^collection=//p' "$REQ")
rm -f "$REQ"

STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

json() {
  printf '%s' "$1" | tr '\t\n' '  ' | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

status() { # state error
  local finished=""
  [ "$1" != running ] && finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat >"$STATUS.tmp" <<EOF
{"state":"$1","archive":"$(json "$archive")","by":"$(json "$by")","startedAt":"$STARTED","finishedAt":"$finished","error":"$(json "$2")"}
EOF
  mv "$STATUS.tmp" "$STATUS"
}

fail() {
  echo "Loading the backup failed: $1" >&2
  status failed "$1"
  exit 1
}

# Nothing but names the backup service itself writes, and plain collection names.
[[ "$archive" =~ ^dawai-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}\.archive\.gz$ ]] || fail "Not a backup this service wrote: $archive"
[ -f "$DIR/$archive" ] || fail "$archive is not on the server any more."
[ "${#collections[@]}" -gt 0 ] || fail "No collections were asked for."
for c in "${collections[@]}"; do
  [[ "$c" =~ ^[A-Za-z0-9_]+$ ]] || fail "Not a collection name: $c"
done

# mongodb://user:pass@host:27017/dawai?authSource=admin
#   → the database (dawai) and the same address without it.
scheme=${URI%%://*}
rest=${URI#*://}
hosts=${rest%%/*}
path=""
[[ "$rest" == */* ]] && path=${rest#*/}
db=${path%%\?*}
query=""
[[ "$path" == *\?* ]] && query="?${path#*\?}"
[ -n "$db" ] || fail "MONGODB_URI names no database."
BASE="$scheme://$hosts/$query"
STAGE="${db}_restore"

echo "Loading $archive into $STAGE (${#collections[@]} collections${by:+, for $by})"
status running ""

args=()
for c in "${collections[@]}"; do args+=(--nsInclude "$db.$c"); done

ERR=$(timeout "${BACKUP_TIMEOUT:-3600}" mongorestore --uri="$BASE" --archive="$DIR/$archive" --gzip \
  "${args[@]}" --nsFrom "$db.*" --nsTo "$STAGE.*" --drop --noIndexRestore 2>&1) \
  || fail "$(printf '%s' "$ERR" | tail -n 1 | cut -c1-300)"

status ready ""
echo "Loaded $archive into $STAGE"
