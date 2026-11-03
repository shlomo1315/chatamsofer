#!/usr/bin/env bash
# הפעלת "כניסה עם Google" ב-Supabase שב-AWS. מריצים ב-CloudShell (פרנקפורט):
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/google-login.sh?$(date +%s)")
# שואל Client ID ו-Client Secret של Google (ה-Secret בלי הד למסך), שומר ב-chasamsofer/supabase-gw בלי הדפסה,
# מעדכן את הסטאק (בלי לשנות את מספר השרתים) ובודק ש-Google מופעל. לפני כן, ב-Google Cloud > OAuth client > Authorized redirect URIs:
#   https://aws.chasamsofer.co.il/auth/v1/callback
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; DOMAIN=${DOMAIN:-aws.chasamsofer.co.il}
RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
param() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }
count() { aws ecs describe-services --cluster "$P" --services "$1" --query 'services[0].desiredCount' --output text; }
[[ "$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)" != *_IN_PROGRESS ]] \
  || { echo "הסטאק באמצע עדכון. מחכים שיסתיים ומריצים שוב"; exit 1; }

read -r -p "Google Client ID: " ID
read -r -s -p "Google Client Secret (לא יוצג): " SEC; echo
[[ "$ID" == *.apps.googleusercontent.com ]] || { echo "Client ID צריך להסתיים ב-.apps.googleusercontent.com"; exit 1; }
[ -n "$SEC" ] || { echo "Client Secret ריק"; exit 1; }
CUR=$(aws secretsmanager get-secret-value --secret-id "$P/supabase-gw" --query SecretString --output text)
aws secretsmanager put-secret-value --secret-id "$P/supabase-gw" --secret-string "$(jq --arg i "$ID" --arg s "$SEC" \
  '.google_enabled="true" | .google_client_id=$i | .google_secret=$s' <<<"$CUR")" >/dev/null
unset CUR SEC
echo "== נשמר ב-$P/supabase-gw (בלי הדפסה)"

echo "== עדכון הסטאק (כמה דקות)"
CPU=$(param TaskCpu); MEM=$(param TaskMemory)
env DOMAIN="$DOMAIN" CPU="${CPU:-512}" MEMORY="${MEM:-1024}" DESIRED="$(count "$P")" SUPA="$(count "$P-supabase")" \
  bash <(curl -fsSL "$RAW/cloudshell-setup.sh?$(date +%s)") >/tmp/google-setup.log 2>&1 || { tail -30 /tmp/google-setup.log; exit 1; }
# הסוד נקרא רק כשמשימה עולה, אז מרימים את Supabase מחדש גם אם התבנית לא השתנתה
aws ecs update-service --cluster "$P" --service "$P-supabase" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$P" --services "$P-supabase"

ANON=$(aws secretsmanager get-secret-value --secret-id "$P/supabase-gw" --query SecretString --output text | jq -r .anon_key)
G=$(curl -fsS -H "apikey: $ANON" "https://$DOMAIN/auth/v1/settings" | jq -r '.external.google' || true)
unset ANON
echo; echo "Google מופעל: $G"
[ "$G" = true ] && echo "מוכן. נכנסים ב-https://$DOMAIN/login > כניסה עם Google"
