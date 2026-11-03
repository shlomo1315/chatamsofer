#!/usr/bin/env bash
# תקרת עלות חודשית (60$): מעדכן את התקציב הקיים monthly-total ל-60$ ומעדכן את הסטאק, שמוסיף Budget Action אוטומטי. מריצים ב-CloudShell:
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/cost-cap.sh?$(date +%s)")
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; DOMAIN=${DOMAIN:-aws.chasamsofer.co.il}
RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
param() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text; }
count() { aws ecs describe-services --cluster "$P" --services "$1" --query 'services[0].desiredCount' --output text; }
ACC=$(aws sts get-caller-identity --query Account --output text)
aws budgets update-budget --account-id "$ACC" --new-budget "$(aws budgets describe-budget --account-id "$ACC" --budget-name monthly-total --query Budget --output json | sed -E 's/"Amount": "40(\.0)?"/"Amount": "60.0"/')"
echo "== התקציב monthly-total עודכן ל-60\$ (התראות 50%, 80%, 100% ותחזית נשארו)"
CPU=$(param TaskCpu); MEM=$(param TaskMemory)
env DOMAIN="$DOMAIN" CPU="${CPU:-512}" MEMORY="${MEM:-1024}" DESIRED="$(count "$P")" SUPA="$(count "$P-supabase")" \
  bash <(curl -fsSL "$RAW/cloudshell-setup.sh?$(date +%s)") >/tmp/cost-cap-setup.log 2>&1 || { tail -30 /tmp/cost-cap-setup.log; exit 1; }
aws budgets describe-budget-actions-for-budget --account-id "$ACC" --budget-name "$P-cost-cap" --query 'Actions[].[ActionThreshold.Value,Status]' --output text
echo "מוכן: בחציית 60\$ נחסמת יצירת משאבים חדשים בתשלום (האתר ממשיך לרוץ)"
