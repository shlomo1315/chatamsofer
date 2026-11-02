#!/usr/bin/env bash
# מילוי הסוד chasamsofer/prod מתוך הדבקה של משתני Railway. מריצים ב-CloudShell (פרנקפורט):
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/fill-secret.sh?$(date +%s)")
# ב-Railway: השירות chatamsofer > Variables > Raw Editor > מעתיקים הכול, מדביקים כאן, ואז Enter ו-Ctrl+D.
# הערכים לא נשמרים בקובץ ולא מודפסים. מודפסים רק שמות. מפתח שלא הודבק נשאר כמו שהוא בסוד.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
SECRET="${SECRET:-chasamsofer/prod}"
CUR=$(aws secretsmanager get-secret-value --secret-id "$SECRET" --query SecretString --output text)
echo "הדבק עכשיו את המשתנים (KEY=value בשורה), ואז Enter ו-Ctrl+D:"
IN=$(cat)
NEW=$(printf '%s\n' "$IN" | jq -Rn --argjson cur "$CUR" '
  [inputs | select(test("^[A-Za-z0-9_]+=")) | capture("^(?<k>[A-Za-z0-9_]+)=(?<v>.*)$")
   | .v |= (if test("^\".*\"$") then (try fromjson catch .[1:-1]) elif test("^'"'"'.*'"'"'$") then .[1:-1] else . end)
   | select(.k as $k | $cur | has($k)) | {(.k): .v}] | add // {}')
MERGED=$(jq -n --argjson cur "$CUR" --argjson new "$NEW" '$cur + $new')
aws secretsmanager put-secret-value --secret-id "$SECRET" --secret-string "$MERGED" >/dev/null
echo "עודכנו $(jq 'length' <<<"$NEW") מפתחות מתוך $(jq 'length' <<<"$CUR")."
echo "עדיין ריקים (שמות בלבד):"
jq -r 'to_entries[] | select(.value=="") | .key' <<<"$MERGED" | tr '\n' ' '; echo
