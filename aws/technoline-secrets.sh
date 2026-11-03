#!/usr/bin/env bash
# מילוי משתני טכנוליין בסוד chasamsofer/prod. מריצים ב-CloudShell (פרנקפורט):
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/technoline-secrets.sh?$(date +%s)")
# ברירת המחדל: המערכת הראשית בלבד. לכל המערכות: SYSTEMS="MAIN YERID DISTRIBUTORS" bash ...
# סוד הנתיב נוצר אקראית לכל מערכת בנפרד (רק אם עוד ריק), כך שסוד של מערכת אחת לא פותח אחרת.
# מפתח ה-API מוקלד מוסתר ולא מודפס. Enter ריק = משאירים את הערך הקיים.
# בסוף מודפסות כתובות ה-webhook להגדרה בפאנל של טכנוליין (הן כוללות את סוד הנתיב, לא לשתף).
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
SECRET="${SECRET:-chasamsofer/prod}"
DOMAIN="${DOMAIN:-chasamsofer.co.il}"
SYSTEMS="${SYSTEMS:-MAIN}"
CUR=$(aws secretsmanager get-secret-value --secret-id "$SECRET" --query SecretString --output text)
get() { jq -r --arg k "$1" '.[$k] // ""' <<<"$CUR"; }
put() { CUR=$(jq --arg k "$1" --arg v "$2" '.[$k]=$v' <<<"$CUR"); }
ask() { # ask <מפתח> <שאלה> [hidden]
  local v
  if [[ "${3:-}" == hidden ]]; then read -rsp "$2: " v; echo; else read -rp "$2: " v; fi
  [[ -n "$v" ]] && put "$1" "$v"
  return 0
}
state() { [[ -n "$(get "$1")" ]] && echo "קיים" || echo "ריק"; }

for S in $SYSTEMS; do
  [[ "$S" =~ ^(MAIN|YERID|DISTRIBUTORS)$ ]] || { echo "מערכת לא מוכרת: $S"; exit 1; }
  P="TECHNOLINE_$S"
  echo "== $S"
  [[ -z "$(get "${P}_SECRET")" ]] && { put "${P}_SECRET" "$(openssl rand -hex 24)"; echo "נוצר סוד נתיב חדש ל-$S"; }
  ask "${P}_API_KEY" "מפתח API של $S ($(state "${P}_API_KEY"), Enter = בלי שינוי)" hidden
  ask "${P}_NUMBER" "המספר הראשי של $S ($(state "${P}_NUMBER"))"
  ask "${P}_CALLER_ID" "מספר יוצא (Caller ID) של $S ($(state "${P}_CALLER_ID"))"
  if [[ "$S" == MAIN ]]; then
    ask TECHNOLINE_MAIN_EXT_MENU "נתיב שלוחת התפריט הראשי בטכנוליין ($(state TECHNOLINE_MAIN_EXT_MENU))"
    ask TECHNOLINE_MAIN_EXT_HOLIDAYS "נתיב שלוחת החגים ($(state TECHNOLINE_MAIN_EXT_HOLIDAYS))"
    ask TECHNOLINE_MAIN_EXT_MATERNITY "נתיב שלוחת היולדות ($(state TECHNOLINE_MAIN_EXT_MATERNITY))"
  fi
done

# שני סודות זהים חוסמים את שתי המערכות (fail-closed). לא אמור לקרות, אבל בודקים
DUP=$(jq -r '[.TECHNOLINE_MAIN_SECRET, .TECHNOLINE_YERID_SECRET, .TECHNOLINE_DISTRIBUTORS_SECRET] | map(select(. != null and . != "")) | (length - (unique | length))' <<<"$CUR")
[[ "$DUP" == 0 ]] || { echo "שגיאה: שתי מערכות עם אותו סוד נתיב. לא נשמר."; exit 1; }

aws secretsmanager put-secret-value --secret-id "$SECRET" --secret-string "$CUR" >/dev/null
echo
echo "נשמר. עדיין ריקים (שמות בלבד):"
jq -r 'to_entries[] | select((.key | startswith("TECHNOLINE_")) and .value=="") | .key' <<<"$CUR" | tr '\n' ' '; echo
echo
echo "כתובות ה-webhook לפאנל של טכנוליין (סודי, לא לשתף):"
for S in $SYSTEMS; do
  L=$(tr '[:upper:]' '[:lower:]' <<<"$S")
  EXTS="menu"; [[ "$S" == MAIN ]] && EXTS="menu maternity holidays otp"
  for E in $EXTS; do echo "  $S/$E: https://$DOMAIN/api/webhooks/technoline/$L/$(get "TECHNOLINE_${S}_SECRET")/$E"; done
done
echo
echo "השרתים קוראים את הסוד רק בהפעלה. להחלה: aws ecs update-service --cluster chasamsofer --service chasamsofer --force-new-deployment"
