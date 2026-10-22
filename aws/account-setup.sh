#!/usr/bin/env bash
# מעטפת לחשבון AWS: תקציב, התראות עלות, יומן פעולות, זיהוי פריצות והקשחות בסיס. מריצים פעם אחת ב-CloudShell. בלי מפתחות.
# שימוש: ALERT_EMAIL=you@example.com BUDGET=60 bash account-setup.sh
# הרצה חוזרת בטוחה: מעדכנת את אותם סטאקים (למשל לשינוי התקציב).
set -euo pipefail
REGION=eu-central-1
RAW=https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws
ALERT_EMAIL="${ALERT_EMAIL:?חסר ALERT_EMAIL=<המייל להתראות>}"
BUDGET="${BUDGET:-60}"
ANOMALY="${ANOMALY:-10}"
[[ "$ALERT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "מייל לא תקין: $ALERT_EMAIL"; exit 1; }
[[ "$BUDGET" =~ ^[0-9]+$ && "$BUDGET" -ge 1 ]] || { echo "BUDGET חייב להיות מספר שלם בדולרים"; exit 1; }

stack_exists() { aws cloudformation describe-stacks --region "$1" --stack-name "$2" >/dev/null 2>&1; }

echo "== 1/4 הקשחות בסיס בחשבון"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers \
  --require-uppercase-characters --require-lowercase-characters --allow-users-to-change-password --password-reuse-prevention 12
aws s3control put-public-access-block --account-id "$ACCOUNT" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws ec2 enable-ebs-encryption-by-default --region "$REGION" >/dev/null
echo "מדיניות סיסמאות, חסימת S3 ציבורי והצפנת דיסקים: פעילים"

echo "== 2/4 תקציב והתראות עלות (us-east-1)"
curl -fsSL "$RAW/account-costs.yml" -o /tmp/account-costs.yml
MONITOR=""
if stack_exists us-east-1 account-costs; then
  MONITOR=$(aws cloudformation describe-stacks --region us-east-1 --stack-name account-costs \
    --query "Stacks[0].Parameters[?ParameterKey=='ExistingMonitorArn'].ParameterValue" --output text)
else
  # בחשבונות חדשים AWS כבר יוצר מוניטור לפי שירות, ואי אפשר ליצור שני
  MONITOR=$(aws ce get-anomaly-monitors --region us-east-1 \
    --query "AnomalyMonitors[?MonitorType=='DIMENSIONAL' && MonitorDimension=='SERVICE'] | [0].MonitorArn" --output text 2>/dev/null || true)
  [[ "$MONITOR" == "None" ]] && MONITOR=""
fi
aws cloudformation deploy --region us-east-1 --stack-name account-costs --template-file /tmp/account-costs.yml \
  --tags Project=account \
  --parameter-overrides AlertEmail="$ALERT_EMAIL" MonthlyBudgetUsd="$BUDGET" AnomalyThresholdUsd="$ANOMALY" ExistingMonitorArn="$MONITOR"

echo "== 3/4 אבטחה: CloudTrail, GuardDuty, Access Analyzer ($REGION)"
curl -fsSL "$RAW/account-security.yml" -o /tmp/account-security.yml
GD=true; AA=true
if stack_exists "$REGION" account-security; then
  GD=$(aws cloudformation describe-stacks --region "$REGION" --stack-name account-security --query "Stacks[0].Parameters[?ParameterKey=='EnableGuardDuty'].ParameterValue" --output text)
  AA=$(aws cloudformation describe-stacks --region "$REGION" --stack-name account-security --query "Stacks[0].Parameters[?ParameterKey=='EnableAccessAnalyzer'].ParameterValue" --output text)
else
  [[ -n "$(aws guardduty list-detectors --region "$REGION" --query 'DetectorIds[0]' --output text | grep -v None || true)" ]] && GD=false
  [[ -n "$(aws accessanalyzer list-analyzers --region "$REGION" --type ACCOUNT --query 'analyzers[0].arn' --output text | grep -v None || true)" ]] && AA=false
fi
aws cloudformation deploy --region "$REGION" --stack-name account-security --template-file /tmp/account-security.yml \
  --tags Project=account \
  --parameter-overrides AlertEmail="$ALERT_EMAIL" EnableGuardDuty="$GD" EnableAccessAnalyzer="$AA"

echo "== 4/4 תגית Project בדוחות החיוב"
# התגית מופיעה בחיוב רק אחרי שמשאב מתויג קיים 24 שעות. אם נכשל עכשיו, מריצים שוב מחר.
aws ce update-cost-allocation-tags-status --region us-east-1 --cost-allocation-tags-status TagKey=Project,Status=Active >/dev/null 2>&1 \
  && echo "התגית Project פעילה בחיוב" || echo "התגית Project עוד לא זמינה בחיוב. להריץ שוב את הסקריפט מחר."

echo
echo "== סיום. נשאר לך:"
echo "  1) לאשר במייל $ALERT_EMAIL את ההודעה 'AWS Notification - Subscription Confirmation' (התראות אבטחה)"
echo "  2) תקציב: $BUDGET\$ בחודש. התראות ב-50%, 80%, 100% ובתחזית חריגה. חריגה לא רגילה מעל $ANOMALY\$: מייל יומי"
