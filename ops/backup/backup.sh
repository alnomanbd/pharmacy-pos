#!/bin/bash
# One backup: the database and the uploads, side by side under one timestamp,
# then a copy off the server and the old ones cleared away.
#
#   backup.sh [reason] [who]      reason: scheduled | manual
#
# Writes /backups/.status.json as it goes, which the console's System page
# reads, and touches /backups/.last-backup only once everything kept here has
# been written. A failed copy to Google Drive does not undo the local backup;
# it is reported as such.
set -uo pipefail

DIR=${BACKUP_DIR:-/backups}
URI=${MONGODB_URI:-mongodb://mongo:27017/dawai}
REMOTE=${BACKUP_REMOTE:-}
KEEP_LOCAL=${BACKUP_KEEP_LOCAL_DAYS:-7}
KEEP_REMOTE=${BACKUP_KEEP_DAYS:-30}
UPLOADS=${UPLOADS_DIR:-/uploads}
REASON=${1:-scheduled}
WHO=${2:-}

STATUS="$DIR/.status.json"
STAMP=$(date +%Y-%m-%d_%H%M)
DB_FILE="dawai-$STAMP.archive.gz"
UP_FILE="uploads-$STAMP.tgz"
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$DIR"

# Only one at a time: a console request landing during the nightly run waits
# for the next look rather than dumping the database twice at once.
exec 9>"$DIR/.lock"
if ! flock -n 9; then
  echo "A backup is already running."
  exit 0
fi

# A string made safe to put between JSON quotes.
json() {
  printf '%s' "$1" | tr '\t\n' '  ' | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

status() { # state offsite error
  local finished=""
  [ "$1" != running ] && finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat >"$STATUS.tmp" <<EOF
{"state":"$1","reason":"$(json "$REASON")","by":"$(json "$WHO")","startedAt":"$STARTED","finishedAt":"$finished","database":"$DB_FILE","uploads":"$UP_FILE","remote":"$(json "${REMOTE%%:*}")","offsite":"$2","error":"$(json "$3")"}
EOF
  mv "$STATUS.tmp" "$STATUS"
}

fail() {
  echo "Backup failed: $1" >&2
  rm -f "$DIR/$DB_FILE.part" "$DIR/$UP_FILE.part"
  status failed none "$1"
  exit 1
}

echo "Backup $STAMP ($REASON${WHO:+, by $WHO})"
status running none ""

# The database. Written beside its final name and moved into place, so a file
# with the final name is always a whole one.
# On failure mongodump's last line is the reason ("could not connect", "not
# authorized"). An hour is far more than it needs; it stops one that hangs
# from holding up every backup after it.
ERR=$(timeout "${BACKUP_TIMEOUT:-3600}" mongodump --uri="$URI" --archive="$DIR/$DB_FILE.part" --gzip 2>&1) \
  || fail "The database dump failed: $(printf '%s' "$ERR" | tail -n 1 | cut -c1-300)"
mv "$DIR/$DB_FILE.part" "$DIR/$DB_FILE"

# Shop logos and payment screenshots.
if [ -d "$UPLOADS" ]; then
  ERR=$(tar czf "$DIR/$UP_FILE.part" -C "$UPLOADS" . 2>&1) \
    || fail "Packing the uploads failed: ${ERR:-tar exited with an error}"
  mv "$DIR/$UP_FILE.part" "$DIR/$UP_FILE"
else
  UP_FILE=""
fi

touch "$DIR/.last-backup"

# Off the server. The remote is normally an rclone "crypt" wrapping Google
# Drive, so what lands in Drive cannot be read without the passphrase.
OFFSITE=off
OFFSITE_ERR=""
if [ -n "$REMOTE" ]; then
  files=(--include "$DB_FILE")
  [ -n "$UP_FILE" ] && files+=(--include "$UP_FILE")
  if ERR=$(timeout "${BACKUP_TIMEOUT:-3600}" rclone copy "$DIR" "$REMOTE" "${files[@]}" 2>&1); then
    OFFSITE=ok
    # Older than the remote keeps; a failure here is not worth failing over.
    rclone delete "$REMOTE" --min-age "${KEEP_REMOTE}d" \
      --include 'dawai-*.archive.gz' --include 'uploads-*.tgz' >/dev/null 2>&1 || true
  else
    OFFSITE=failed
    OFFSITE_ERR="Copy to ${REMOTE%%:*} failed: $(printf '%s' "$ERR" | tail -n 3)"
    echo "$OFFSITE_ERR" >&2
  fi
fi

# What this server keeps: the last week, by default. Drive keeps the month.
# The copies of a shop taken before putting it back (shop-*.ejson.gz) go too.
find "$DIR" -maxdepth 1 -type f \( -name 'dawai-*.archive.gz' -o -name 'uploads-*.tgz' -o -name 'shop-*.ejson.gz' \) \
  -mtime +"$KEEP_LOCAL" -delete

status ok "$OFFSITE" "$OFFSITE_ERR"
echo "Backup $STAMP done (off the server: $OFFSITE)"
