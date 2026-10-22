#!/usr/bin/env bash
# הקמת חתם סופר ב-AWS. מדביקים ב-CloudShell (אזור Frankfurt). בלי מפתחות.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
DOMAIN=chasamsofer.co.il
STACK=chasamsofer

echo "== 1/4 תעודת SSL"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)
if [ "$CERT" = "None" ] || [ -z "$CERT" ]; then
  CERT=$(aws acm request-certificate --domain-name "$DOMAIN" --subject-alternative-names "www.$DOMAIN" --validation-method DNS --query CertificateArn --output text)
  sleep 10
fi
echo "ARN: $CERT"
echo
echo "== הוסף ב-domainthenet את רשומות ה-CNAME הבאות (שם | ערך):"
aws acm describe-certificate --certificate-arn "$CERT" \
  --query "Certificate.DomainValidationOptions[].ResourceRecord.[Name,Value]" --output text | sort -u
echo
echo "ממתין לאימות התעודה (עד 30 דקות). אחרי שהוספת את הרשומות זה ימשיך לבד..."
aws acm wait certificate-validated --certificate-arn "$CERT"
echo "התעודה אושרה."

echo "== 2/4 רשת ברירת מחדל"
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query "Subnets[].SubnetId" --output text | tr '\t' ',')
echo "VPC: $VPC | Subnets: $SUBNETS"

echo "== 3/4 הורדת התבנית"
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/infrastructure.yml -o /tmp/infrastructure.yml

echo "== 4/4 יצירת הסטאק (5-10 דקות)"
aws cloudformation deploy --stack-name "$STACK" --template-file /tmp/infrastructure.yml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameter-overrides CertificateArn="$CERT" VpcId="$VPC" SubnetIds="$SUBNETS" DesiredCount=0 CreateOidcProvider=true

echo
echo "== סיום. תוצאות (העתק ושלח לי, אין בהן סודות):"
aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
