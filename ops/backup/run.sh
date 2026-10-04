#!/bin/bash
# The backup container's whole life: a backup every night at BACKUP_AT (server
# time, TZ), and one whenever the console asks for it by leaving
# /backups/.request. One loop, so the two can never run over each other.
set -uo pipefail

DIR=${BACKUP_DIR:-/backups}
AT=${BACKUP_AT:-02:00}
mkdir -p "$DIR"

echo "Backups: nightly at $AT ($(date +%Z)), off the server to ${BACKUP_REMOTE:-nowhere (BACKUP_REMOTE is not set)}"

last_night=""
while true; do
  if [ -f "$DIR/.request" ]; then
    who=$(sed -n 's/.*"by":"\([^"]*\)".*/\1/p' "$DIR/.request" | head -n 1)
    rm -f "$DIR/.request"
    backup.sh manual "$who"
  fi

  today=$(date +%F)
  now=$(date +%H%M)
  if [ "$last_night" != "$today" ] && [ "$now" -ge "${AT/:/}" ]; then
    last_night=$today
    # Once a day. A container (re)started after the hour still takes tonight's
    # unless one was already taken since then — a restart is not a second run.
    taken=""
    for f in "$DIR"/dawai-"$today"_*.archive.gz; do
      [ -e "$f" ] || continue
      t=${f##*_}; t=${t%%.*}
      [ "$t" -ge "${AT/:/}" ] && taken=yes
    done
    [ -z "$taken" ] && backup.sh scheduled ""
  fi

  sleep 15
done
