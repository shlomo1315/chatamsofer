#!/usr/bin/env bash
# הקמת פרויקט ב-AWS (ECS Fargate) מתבנית אחת. מדביקים ב-CloudShell (Frankfurt). בלי מפתחות.
# ברירת המחדל היא חתם סופר. לפרויקט אחר: PROJECT=<שם> REPO=<owner/repo> DOMAIN=<דומיין> bash cloudshell-setup.sh
# מצב בדיקה: בלי CERT, HTTP על כתובת ה-ALB. מעבר ל-HTTPS: מריצים שוב עם CERT=<arn של תעודה> (אותו סטאק, עדכון בלבד).
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
PROJECT="${PROJECT:-chasamsofer}"
REPO="${REPO:-shlomo1315/chatamsofer}"
DOMAIN="${DOMAIN:-chasamsofer.co.il}"
STACK="${STACK:-$PROJECT}"
CERT="${CERT:-}"
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "PROJECT חייב להיות אותיות קטנות באנגלית, ספרות ומקף"; exit 1; }

echo "== 1/3 רשת ברירת מחדל"
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query "Subnets[].SubnetId" --output text | tr '\t' ',')
echo "VPC: $VPC | Subnets: $SUBNETS"

echo "== 2/3 הורדת התבנית"
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/infrastructure.yml -o /tmp/infrastructure.yml

echo "== 3/3 יצירת/עדכון הסטאק (5-10 דקות)"
# DesiredCount=${DESIRED:-0}: 0 בהקמה. אחרי הזנת הסוד ודחיפת image: DESIRED=1 (שרת אחד בלבד!)
# CreateOidcProvider: provider של GitHub הוא אחד לחשבון. בפרויקט שני ואילך (או בעדכון) לא יוצרים אותו שוב.
OIDC=true
EXISTING_OIDC=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn,'token.actions.githubusercontent.com')].Arn | [0]" --output text)
if [[ "$EXISTING_OIDC" != "None" && -n "$EXISTING_OIDC" ]]; then OIDC=false; fi
if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  # בעדכון חוזר שומרים את הערך שהסטאק נוצר איתו
  OIDC=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='CreateOidcProvider'].ParameterValue" --output text)
  EXISTING_OIDC=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='ExistingOidcProviderArn'].ParameterValue" --output text)
fi
[[ "$EXISTING_OIDC" == "None" ]] && EXISTING_OIDC=""
aws cloudformation deploy --stack-name "$STACK" --template-file /tmp/infrastructure.yml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags Project="$PROJECT" \
  --parameter-overrides ProjectName="$PROJECT" GitHubRepo="$REPO" DomainName="$DOMAIN" CertificateArn="$CERT" \
    VpcId="$VPC" SubnetIds="$SUBNETS" DesiredCount="${DESIRED:-0}" CreateOidcProvider="$OIDC" ExistingOidcProviderArn="$EXISTING_OIDC"

echo
echo "== סיום. תוצאות (אין בהן סודות):"
aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
ALB=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)
echo
echo "כתובת בדיקה: http://$ALB"
echo "שלבים הבאים: 1) מזינים את משתני הסביבה בסוד $PROJECT/prod (Secrets Manager)"
echo "             2) מריצים ב-GitHub את הפריסה (העלאת image), ואז שוב כאן עם DESIRED=1 (שרת אחד בלבד, בגלל התזמונים הפנימיים)"
echo "             3) בודקים http://$ALB/api/health"
