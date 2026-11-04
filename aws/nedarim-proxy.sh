#!/usr/bin/env bash
# שרת הביניים לנדרים פלוס (כתובת קבועה). מריצים ב-CloudShell (פרנקפורט):
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/nedarim-proxy.sh?$(date +%s)")
# מעדכן את הסטאק (נוצר שרת t4g.nano עם כתובת קבועה), ממלא NEDARIM_PROXY_URL ב-chasamsofer/prod בלי להדפיס את הסיסמה,
# מרים את האתר מחדש, ובודק דרך השרת שהפנייה לנדרים יוצאת מהכתובת הקבועה. בסוף מדפיס את הכתובת להוספה בנדרים.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}
RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
param() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
count() { aws ecs describe-services --cluster "$P" --services "$1" --query 'services[0].desiredCount' --output text; }
[[ "$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)" != *_IN_PROGRESS ]] \
  || { echo "הסטאק באמצע עדכון. מחכים שיסתיים ומריצים שוב"; exit 1; }

# הדומיין ומצב ה-DNS נשמרים כמו שהם בסטאק. ברירת מחדל אחרת (aws.chasamsofer.co.il) מחליפה את התעודה הראשית ומפילה את האתר
DOMAIN=${DOMAIN:-$(param DomainName)}; CREATE_ZONE=${CREATE_ZONE:-$(param CreateDnsZone)}
[[ -n "$DOMAIN" && "$DOMAIN" != None ]] || { echo "לא נמצא DomainName בסטאק"; exit 1; }
echo "== עדכון הסטאק (כמה דקות) | דומיין: $DOMAIN | אזור DNS: $CREATE_ZONE"
CPU=$(param TaskCpu); MEM=$(param TaskMemory)
env DOMAIN="$DOMAIN" CREATE_ZONE="$CREATE_ZONE" CPU="${CPU:-512}" MEMORY="${MEM:-1024}" DESIRED="$(count "$P")" SUPA="$(count "$P-supabase")" \
  bash <(curl -fsSL "$RAW/cloudshell-setup.sh?$(date +%s)") >/tmp/nedarim-proxy-setup.log 2>&1 || { tail -30 /tmp/nedarim-proxy-setup.log; exit 1; }

IP=$(out NedarimProxyIp); PRIV=$(out NedarimProxyPrivateIp); IID=$(out NedarimProxyId); PS=$(out NedarimProxySecretArn)
[ -n "$IP" ] && [ -n "$PRIV" ] || { echo "חסרים פלטים של שרת הביניים"; exit 1; }
SEC=$(aws secretsmanager get-secret-value --secret-id "$PS" --query SecretString --output text)
U=$(jq -r .user <<<"$SEC"); PW=$(jq -r .password <<<"$SEC"); unset SEC
# האתר מתחבר דרך הכתובת הפרטית (קבוצת האבטחה מרשה רק אותו). הכתובת הקבועה היא של היציאה.
URL="http://$U:$PW@$PRIV:3128"
CUR=$(aws secretsmanager get-secret-value --secret-id "$P/prod" --query SecretString --output text)
aws secretsmanager put-secret-value --secret-id "$P/prod" --secret-string "$(jq --arg u "$URL" '.NEDARIM_PROXY_URL=$u' <<<"$CUR")" >/dev/null
unset CUR URL
echo "== NEDARIM_PROXY_URL עודכן ב-$P/prod (בלי הדפסה)"

echo "== בדיקה דרך השרת (מחכים שיעלה ויתקין)"
aws ec2 wait instance-status-ok --instance-ids "$IID"
CID=""
for _ in $(seq 1 30); do
  CID=$(aws ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript --query Command.CommandId --output text \
    --parameters commands=/usr/local/bin/proxy-check 2>/dev/null) && break || { sleep 10; CID=""; }
done
[ -n "$CID" ] || { echo "SSM עוד לא זמין בשרת. מריצים שוב את הסקריפט בעוד דקה"; exit 1; }
sleep 8
EG=$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$IID" --query StandardOutputContent --output text 2>/dev/null | tr -d '[:space:]' || true)
echo "יציאה דרך השרת מהכתובת: ${EG:-לא התקבל}"

aws ecs update-service --cluster "$P" --service "$P" --force-new-deployment >/dev/null
aws ecs wait services-stable --cluster "$P" --services "$P"
H=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || true)
echo "האתר /api/health: $H"
echo
echo "הכתובת להוספה בנדרים (עוד > מפתחות API): $IP"
[ "$EG" = "$IP" ] || echo "שימו לב: הכתובת שהתקבלה בבדיקה שונה מ-$IP. לא להוסיף בנדרים עד שבודקים"
