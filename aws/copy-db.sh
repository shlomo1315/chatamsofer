#!/bin/sh
# רץ בתוך משימת ECS (תמונת postgres:17). קריאה בלבד מהמקור (pg_dump), כתיבה רק ל-RDS החדש.
# משתנים מהסודות: SRC_HOST SRC_USER SRC_PASS, וה-RDS: DST_HOST DST_USER DST_PASS.
set -eu
export PGSSLMODE=require
SCHEMAS="${SCHEMAS:-public}"
ARGS=""; for s in $SCHEMAS; do ARGS="$ARGS --schema=$s"; done
echo "dump from source (read-only) -> restore to RDS; schemas: $SCHEMAS"
PGPASSWORD="$SRC_PASS" pg_dump -h "$SRC_HOST" -p 5432 -U "$SRC_USER" -d postgres $ARGS \
  --no-owner --no-privileges --format=custom -f /tmp/src.dump
PGPASSWORD="$DST_PASS" pg_restore -h "$DST_HOST" -U "$DST_USER" -d app --no-owner --no-privileges --exit-on-error /tmp/src.dump || \
  { echo "restore failed"; exit 1; }
# דוח: שורות לכל טבלה, מקור מול יעד
Q="select table_schema||'.'||table_name from information_schema.tables where table_type='BASE TABLE' and table_schema in ($(echo $SCHEMAS | sed "s/\([a-z_]*\)/'\1'/g; s/' '/','/g")) order by 1"
PGPASSWORD="$SRC_PASS" psql -h "$SRC_HOST" -U "$SRC_USER" -d postgres -At -c "$Q" > /tmp/tables.txt
echo "REPORT table|source_rows|dest_rows|match"
while read -r T; do
  S=$(PGPASSWORD="$SRC_PASS" psql -h "$SRC_HOST" -U "$SRC_USER" -d postgres -At -c "select count(*) from $T")
  D=$(PGPASSWORD="$DST_PASS" psql -h "$DST_HOST" -U "$DST_USER" -d app -At -c "select count(*) from $T" 2>/dev/null || echo MISSING)
  [ "$S" = "$D" ] && M=ok || M=DIFF
  echo "REPORT $T|$S|$D|$M"
done < /tmp/tables.txt
