#!/usr/bin/env bash
# מערכת הניהול רק מישראל + הגבלת קצב על הכניסה (כללי WAF). מריצים ב-CloudShell:
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/admin-geo.sh?$(date +%s)")
# כניסה מחו"ל (למשל בנסיעה): מוסיפים את הכתובת (מ-https://checkip.amazonaws.com) ומריצים:
#   ADMIN_IPS=1.2.3.4/32 bash <(curl ...)        כמה כתובות: ADMIN_IPS=1.2.3.4/32,5.6.7.8/32
#   ADMIN_IPS=none bash <(curl ...)               חזרה לישראל בלבד
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; DOMAIN=${DOMAIN:-aws.chasamsofer.co.il}
RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
param() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }
count() { aws ecs describe-services --cluster "$P" --services "$1" --query 'services[0].desiredCount' --output text; }
EXTRA=""
if [[ -n "${ADMIN_IPS:-}" ]]; then
  [[ "$ADMIN_IPS" == none ]] && ADMIN_IPS=""
  for ip in ${ADMIN_IPS//,/ }; do [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/(3[0-2]|[12]?[0-9])$ ]] || { echo "כתובת לא תקינה: $ip (צריך בפורמט 1.2.3.4/32)"; exit 1; }; done
  EXTRA="AdminAllowedIps=$ADMIN_IPS"
fi
echo "== עדכון הסטאק (כמה דקות)"
CPU=$(param TaskCpu); MEM=$(param TaskMemory)
env DOMAIN="$DOMAIN" CPU="${CPU:-512}" MEMORY="${MEM:-1024}" DESIRED="$(count "$P")" SUPA="$(count "$P-supabase")" EXTRA_PARAMS="$EXTRA" \
  bash <(curl -fsSL "$RAW/cloudshell-setup.sh?$(date +%s)") >/tmp/admin-geo-setup.log 2>&1 || { tail -30 /tmp/admin-geo-setup.log; exit 1; }
ALLOWED=$(param AdminAllowedIps)
code() { curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN$1"; }
echo "== בדיקה מ-CloudShell (שרת באירופה, ולכן הניהול אמור להיחסם ב-403):"
echo "   /admin: $(code /admin)   /api/health: $(code /api/health)"
echo "מוכן: מערכת הניהול פתוחה רק מישראל${ALLOWED:+ ומהכתובות $ALLOWED}"
