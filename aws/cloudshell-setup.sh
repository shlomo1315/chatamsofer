#!/usr/bin/env bash
# הקמת חתם סופר ב-AWS במצב בדיקה (בלי דומיין ובלי תעודה): HTTP על כתובת ה-ALB. מדביקים ב-CloudShell (Frankfurt). בלי מפתחות.
# מעבר ל-HTTPS בהמשך: מריצים שוב עם CERT=<arn של תעודה> לפני הפקודה (אותו סטאק, עדכון בלבד).
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
STACK=chasamsofer
CERT="${CERT:-}"

echo "== 1/3 רשת ברירת מחדל"
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query "Subnets[].SubnetId" --output text | tr '\t' ',')
echo "VPC: $VPC | Subnets: $SUBNETS"

echo "== 2/3 הורדת התבנית"
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/infrastructure.yml -o /tmp/infrastructure.yml

echo "== 3/3 יצירת/עדכון הסטאק (5-10 דקות)"
# DesiredCount=${DESIRED:-0}: 0 בהקמה. אחרי הזנת הסוד ודחיפת image: DESIRED=1 (שרת אחד בלבד!)
# CreateOidcProvider: בעדכון חוזר שומרים את הערך הקיים
OIDC=true
if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  OIDC=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='CreateOidcProvider'].ParameterValue" --output text)
fi
aws cloudformation deploy --stack-name "$STACK" --template-file /tmp/infrastructure.yml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags Project="$STACK" \
  --parameter-overrides CertificateArn="$CERT" VpcId="$VPC" SubnetIds="$SUBNETS" DesiredCount="${DESIRED:-0}" CreateOidcProvider="$OIDC"

echo
echo "== סיום. תוצאות (אין בהן סודות):"
aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
ALB=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)
echo
echo "כתובת בדיקה: http://$ALB"
echo "שלבים הבאים: 1) מזינים את משתני הסביבה בסוד chasamsofer/prod (Secrets Manager)"
echo "             2) מריצים שוב עם DESIRED=1 (שרת אחד בלבד, בגלל התזמונים הפנימיים)"
echo "             3) בודקים http://$ALB/api/health"
