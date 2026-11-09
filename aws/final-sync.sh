#!/usr/bin/env bash
# העתקת הפרשים אחרונה מ-Supabase (קריאה בלבד) אל AWS, רגע לפני החלפת שרתי השמות. CloudShell, Frankfurt.
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/final-sync.sh?$(date +%s)")
# מה זה עושה: מכבה את האתר ו-Supabase ב-AWS (רק האתר הזמני נופל), מעתיק מחדש את המסד כולו (public ו-auth, תמונת מצב אחת),
# מעלה את Supabase ומעתיק רק קבצים חדשים, מעלה את האתר ובודק בריאות. הסטאק (CloudFormation) לא משתנה והדומיין הראשי לא נוגעים בו.
# מה שנכתב ב-AWS מאז ההעתקה הקודמת (בדיקות על האתר הזמני) נמחק: זה כוונה, כי כל הנתונים האמיתיים עדיין נכתבים במקור.
# להריץ ממש לפני ההחלפה, ולהחליף שרתי שמות מיד אחרי. YES=1 מדלג על שאלת האישור. DOMAIN (ברירת מחדל: הדומיין של הסטאק) נבדק ישירות מול המאזן, גם כשה-DNS עדיין מצביע לשרת הישן. דורש שהתעודה של הדומיין כבר אומתה.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DOMAIN=${DOMAIN:-$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='DomainName'].ParameterValue" --output text)}
# הדומיין עדיין מצביע לשרת הישן, ולכן פונים למאזן ישירות עם שם הדומיין (--resolve), וגם משימת ההעתקה מקבלת ALB_HOST
ALB_HOST=$(out AlbDnsName); ALB_IP=$(getent ahostsv4 "$ALB_HOST" | head -1 | cut -d' ' -f1)
step() { echo; echo "== $*"; }
exec 9>"${TMPDIR:-/tmp}/$P-final-sync.lock"
flock -n 9 || { echo "הרצה אחרת של הסקריפט כבר פועלת. ממתינים שתסתיים."; exit 1; }
run_remote() { local f=$1; shift; env "$@" bash <(curl -fsSL "$RAW/$f?$(date +%s)"); }
scale() { aws ecs update-service --cluster "$P" --service "$1" --desired-count "$2" >/dev/null; }
code() { curl -sk -m 15 --resolve "$DOMAIN:443:$ALB_IP" -o /dev/null -w '%{http_code}' "https://$DOMAIN$1" || true; }

S=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)
[[ "$S" != *_IN_PROGRESS ]] || { echo "הסטאק באמצע עדכון ($S). ממתינים ומריצים שוב."; exit 1; }
[ "$(code /api/health)" = 200 ] || { echo "המאזן ב-AWS לא עונה 200 ב-HTTPS על /api/health עבור $DOMAIN. כנראה התעודה עוד לא אומתה (cloudshell-setup.sh שוב), או שהאתר כבוי. לא מתחילים."; exit 1; }
echo "האתר הזמני https://$DOMAIN יורד לכמה דקות. המסד ב-AWS יוחלף כולו בעותק טרי מהמקור."
if [ "${YES:-}" != 1 ]; then read -rp "להמשיך? (כן/לא) " A; [ "$A" = כן ] || { echo "בוטל"; exit 1; }; fi

trap 'echo; echo "הסקריפט נעצר באמצע. מחזירים את האתר ו-Supabase לפעול (אפשר להריץ שוב)."; scale "$P-supabase" 1 || true; scale "$P" 1 || true' ERR

step "1/5 כיבוי האתר ו-Supabase ב-AWS"
scale "$P" 0; scale "$P-supabase" 0
aws ecs wait services-stable --cluster "$P" --services "$P" "$P-supabase"

step "2/5 העתקת המסד מחדש (public ו-auth)"
run_remote copy-from-supabase.sh STEP=db RECOPY_DB=1 DOMAIN="$DOMAIN" | tee /tmp/final-db.txt

step "3/5 הרמת Supabase"
scale "$P-supabase" 1
aws ecs wait services-stable --cluster "$P" --services "$P-supabase"
for i in $(seq 1 30); do [ "$(code /auth/v1/health)" = 200 ] && break; sleep 10; done
[ "$(code /auth/v1/health)" = 200 ] || { echo "שירות Auth לא עלה"; false; }

step "4/5 העתקת קבצים חדשים (קיימים מדולגים)"
run_remote copy-from-supabase.sh STEP=files DOMAIN="$DOMAIN" ALB_HOST="$ALB_HOST" | tee /tmp/final-files.txt

step "5/5 הרמת האתר ובדיקת בריאות"
scale "$P" 1
aws ecs wait services-stable --cluster "$P" --services "$P"
for i in $(seq 1 30); do [ "$(code /api/health)" = 200 ] && break; sleep 10; done
trap - ERR

echo; echo "== סיכום"
echo "בריאות: $(code /api/health)"
echo "טבלאות שנבדקו: $(grep -c '^REPORT public\|^REPORT auth' /tmp/final-db.txt || true)  עם הפרש: $(grep -c ' DIFF' /tmp/final-db.txt || true)"
grep ' DIFF' /tmp/final-db.txt || true
grep '^REPORT' /tmp/final-files.txt || true
echo "אם יש הפרשים קטנים בטבלאות שמקבלות כתיבה, זה צפוי (המקור עדיין פעיל). עכשיו מחליפים שרתי שמות מיד, ולא מחכים."
