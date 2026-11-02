#!/usr/bin/env bash
# העברה מלאה של chasamsofer ל-AWS בפקודה אחת (CloudShell, Frankfurt). במקור (Supabase/Railway) קריאה בלבד, והדומיין הראשי לא נוגעים בו.
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/migrate-all.sh?$(date +%s)")
# שלבים: 1 עדכון סטאק  2 סוד המקור (שואל פעם אחת, בלי הד)  3 מפתחות  4 הרמת Supabase  5 העתקת מסד  6 העתקת קבצים
#        7 בנייה מחדש עם המפתח החדש  8 הרמת האתר ובדיקת בריאות. אפשר להריץ שוב: שלבים שהושלמו מדולגים או נעשים בטוחים לחזרה.
# הדוח (טבלאות, שורות, קבצים; מקור מול יעד) מודפס בשלבים 5 ו-6, ובסוף שורת סיכום.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
DOMAIN=${DOMAIN:-aws.chasamsofer.co.il}
step() { echo; echo "== $*"; }
param() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text 2>/dev/null || true; }
secret_field() { aws secretsmanager get-secret-value --secret-id "$P/$1" --query SecretString --output text | jq -r ".$2 // empty"; }
run_remote() { local f=$1; shift; env "$@" bash <(curl -fsSL "$RAW/$f?$(date +%s)"); }
CPU=$(param TaskCpu); MEM=$(param TaskMemory); CPU=${CPU:-512}; MEM=${MEM:-1024}
setup() { run_remote cloudshell-setup.sh DOMAIN="$DOMAIN" CPU="$CPU" MEMORY="$MEM" DESIRED="$1" SUPA="$2" >/tmp/setup.log 2>&1 || { tail -30 /tmp/setup.log; exit 1; }; }

step "1/8 עדכון הסטאק (שרת האתר כבוי, Supabase כבוי)"
setup 0 0
[ -n "$(param CertificateArn)" ] || { echo "התעודה עוד לא אומתה. מוסיפים את רשומת ה-CNAME שהודפסה בהרצה (tail /tmp/setup.log) ומריצים שוב."; tail -15 /tmp/setup.log; exit 1; }

step "2/8 סוד המקור"
if [ -z "$(secret_field supabase-src password)" ]; then run_remote fill-src-secret.sh; else echo "כבר מולא"; fi

step "3/8 מפתחות JWT וסיסמאות תפקידים (בלי הדפסה)"
run_remote supabase-keys.sh

step "4/8 הרמת PostgREST, Auth, Storage"
setup 0 1
aws ecs wait services-stable --cluster "$P" --services "$P-supabase"
for i in $(seq 1 30); do
  c=$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/auth/v1/health" || true); [ "$c" = 200 ] && break; sleep 10
done
echo "auth health: $c"; [ "$c" = 200 ] || { echo "שירות Auth לא עלה. לוג: /ecs/$P-supabase"; exit 1; }

step "5/8 העתקת מסד (דוח שורות לכל טבלה)"
run_remote copy-from-supabase.sh STEP=db | tee /tmp/report-db.txt

step "6/8 העתקת קבצים (דוח לכל bucket)"
run_remote copy-from-supabase.sh STEP=files | tee /tmp/report-files.txt

step "7/8 בנייה מחדש עם מפתח ה-anon החדש"
ANON=$(secret_field supabase-gw anon_key)
BID=$(aws codebuild start-build --project-name "$P-build" --environment-variables-override \
  name=NEXT_PUBLIC_SUPABASE_URL,value="https://$DOMAIN",type=PLAINTEXT name=NEXT_PUBLIC_SUPABASE_ANON_KEY,value="$ANON",type=PLAINTEXT \
  name=NEXT_PUBLIC_SITE_URL,value="https://$DOMAIN",type=PLAINTEXT name=NEXT_PUBLIC_APP_URL,value="https://$DOMAIN",type=PLAINTEXT \
  --query build.id --output text)
unset ANON
while :; do s=$(aws codebuild batch-get-builds --ids "$BID" --query 'builds[0].buildStatus' --output text); [ "$s" != IN_PROGRESS ] && break; sleep 20; done
echo "build: $s"; [ "$s" = SUCCEEDED ] || { echo "הבנייה נכשלה: $BID"; exit 1; }

step "8/8 הרמת האתר ובדיקת בריאות"
setup 1 1
aws ecs update-service --cluster "$P" --service "$P" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$P" --services "$P"
H=$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || true)
echo; echo "== סיכום"
echo "בריאות https://$DOMAIN/api/health: $H"
echo "טבלאות עם הבדל: $(grep -c '|DIFF' /tmp/report-db.txt || true) | buckets עם הבדל: $(grep -c 'DIFF' /tmp/report-files.txt || true)"
echo "דוחות מלאים: /tmp/report-db.txt /tmp/report-files.txt"
[ "$H" = 200 ]
