#!/bin/sh
# רץ בתוך משימת ECS (תמונת postgres:17). קריאה בלבד מהמקור (pg_dump), כתיבה רק ל-RDS החדש.
# משתנים מהסודות: SRC_HOST SRC_USER SRC_PASS, וה-RDS: DST_HOST DST_USER DST_PASS, וסיסמאות התפקידים (AUTHENTICATOR_PW AUTH_ADMIN_PW STORAGE_ADMIN_PW).
# INIT_SQL הוא התוכן של supabase-init.sql. הסכמה storage לא מועתקת: storage-api בונה אותה בעצמו, והקבצים עולים דרך ה-API (copy-files.mjs).
# רץ לפני הרמת PostgREST, Auth ו-Storage, כדי שהתפקידים והסכמה auth יהיו מוכנים כשהם עולים.
# אם המסד כבר הועתק, ההעתקה מדולגת ורק הדוח מודפס. RECOPY_DB=1 מעתיק מחדש (מוחק ומחליף את הטבלאות ביעד מהמקור).
set -eu
export PGSSLMODE=require
SCHEMAS="${SCHEMAS:-public auth}"
ARGS=""; for s in $SCHEMAS; do ARGS="$ARGS --schema=$s"; done
printf '%s\n' "$INIT_SQL" > /tmp/init.sql
D() { PGPASSWORD="$DST_PASS" psql -h "$DST_HOST" -U "$DST_USER" -d app -v ON_ERROR_STOP=1 "$@"; }
echo "init roles and extensions on RDS"
D -v AUTHENTICATOR_PW="$AUTHENTICATOR_PW" -v AUTH_ADMIN_PW="$AUTH_ADMIN_PW" -v STORAGE_ADMIN_PW="$STORAGE_ADMIN_PW" -f /tmp/init.sql
MISSING=""; for s in $SCHEMAS; do
  [ "$(D -At -c "select count(*) from pg_tables where schemaname='$s'")" != 0 ] || MISSING="$MISSING $s"
done
if [ -z "$MISSING" ] && [ "${RECOPY_DB:-}" != 1 ]; then
  echo "already copied (all schemas have tables: $SCHEMAS), skipping. RECOPY_DB=1 to copy again"
else
  # העתקה מלאה של כל הסכמות יחד, כדי שקשרים בין public ל-auth ייווצרו. --clean מחליף מה שכבר הועתק בעבר
  echo "dump from source (read-only) -> restore to RDS; schemas: $SCHEMAS (missing:${MISSING:- none})"
  PGPASSWORD="$SRC_PASS" pg_dump -h "$SRC_HOST" -p 5432 -U "$SRC_USER" -d postgres $ARGS \
    --no-owner --no-privileges --format=custom -f /tmp/src.dump
  PGPASSWORD="$DST_PASS" pg_restore -h "$DST_HOST" -U "$DST_USER" -d app --no-owner --no-privileges --clean --if-exists /tmp/src.dump 2> /tmp/restore.err || true
  echo "restore errors: $(grep -c 'error:' /tmp/restore.err || true)"
  grep 'error:' /tmp/restore.err | head -20 || true
  # סכמה שנמחקה ונוצרה מחדש ב---clean מאבדת הרשאות: מחילים שוב (בטוח לחזרה)
  D -v AUTHENTICATOR_PW="$AUTHENTICATOR_PW" -v AUTH_ADMIN_PW="$AUTH_ADMIN_PW" -v STORAGE_ADMIN_PW="$STORAGE_ADMIN_PW" -f /tmp/init.sql
fi
echo "fix ownership and grants"
D -c "do \$\$ declare r record; begin
  if exists (select from pg_namespace where nspname='auth') then
    alter schema auth owner to supabase_auth_admin;
    for r in select schemaname s, tablename n from pg_tables where schemaname='auth' loop execute format('alter table %I.%I owner to supabase_auth_admin', r.s, r.n); end loop;
    for r in select sequence_schema s, sequence_name n from information_schema.sequences where sequence_schema='auth' loop execute format('alter sequence %I.%I owner to supabase_auth_admin', r.s, r.n); end loop;
    for r in select n.nspname s, p.proname n, pg_get_function_identity_arguments(p.oid) a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' loop execute format('alter function %I.%I(%s) owner to supabase_auth_admin', r.s, r.n, r.a); end loop;
    for r in select t.typname n from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='auth' and t.typtype='e' loop execute format('alter type auth.%I owner to supabase_auth_admin', r.n); end loop;
  end if; end \$\$;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on all functions in schema public to anon, authenticated, service_role;"
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
