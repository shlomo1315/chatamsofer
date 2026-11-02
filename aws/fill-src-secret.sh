#!/usr/bin/env bash
# מילוי הסוד chasamsofer/supabase-src (חיבור לקריאה בלבד למסד Supabase). מריצים ב-CloudShell (פרנקפורט):
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/fill-src-secret.sh?$(date +%s)")
# הסיסמה נקראת בלי הד למסך ולא נשמרת בקובץ. Supabase > Connect > Session pooler: host (aws-...pooler.supabase.com) ומשתמש (postgres.<ref>).
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
read -r -p "host: " H
read -r -p "user: " U
read -r -s -p "password (לא יוצג): " P; echo
aws secretsmanager put-secret-value --secret-id "${SECRET:-chasamsofer/supabase-src}" \
  --secret-string "$(jq -n --arg h "$H" --arg u "$U" --arg p "$P" '{host:$h,user:$u,password:$p}')" >/dev/null
unset P
echo "נשמר."
