#!/usr/bin/env bash
# הקמת פרויקט ב-AWS (ECS Fargate + ALB + WAF) מתבנית אחת. מדביקים ב-CloudShell (Frankfurt). בלי מפתחות.
# ברירת המחדל היא חתם סופר במצב ביניים: תת-דומיין זמני (aws.chasamsofer.co.il), ה-DNS נשאר אצל הרשם ובלי אזור Route 53.
# מעבר סופי לדומיין המלא: DOMAIN=chasamsofer.co.il CREATE_ZONE=true bash cloudshell-setup.sh (ואז מחליפים שרתי שמות, ראו המדריך).
# לפרויקט אחר: PROJECT=<שם> REPO=<owner/repo> DOMAIN=<דומיין> bash cloudshell-setup.sh
# שרת קטן כברירת מחדל (CPU=512 MEMORY=1024). להגדלה: CPU=1024 MEMORY=2048. בהרצה חוזרת חובה לציין את הגודל שוב, אחרת חוזר לברירת המחדל.
# תעודת HTTPS (ACM) מונפקת כאן באימות DNS. אם היא עוד לא אומתה, הסקריפט מדפיס רשומה להוספה אצל הרשם הנוכחי ומחכה.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
PROJECT="${PROJECT:-chasamsofer}"
REPO="${REPO:-shlomo1315/chatamsofer}"
DOMAIN="${DOMAIN:-aws.chasamsofer.co.il}"
CREATE_ZONE="${CREATE_ZONE:-false}"
[[ "$CREATE_ZONE" == "true" || "$CREATE_ZONE" == "false" ]] || { echo "CREATE_ZONE חייב להיות true או false"; exit 1; }
STACK="${STACK:-$PROJECT}"
[[ "$PROJECT" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "PROJECT חייב להיות אותיות קטנות באנגלית, ספרות ומקף"; exit 1; }

echo "== 1/4 רשת ברירת מחדל (שני אזורי זמינות)"
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query "sort_by(Subnets,&AvailabilityZone)[:2].SubnetId" --output text | tr '\t' ',')
echo "VPC: $VPC | Subnets: $SUBNETS"

echo "== 2/4 תעודת HTTPS (ACM) לדומיין $DOMAIN"
CERT=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)
if [[ "$CERT" == "None" || -z "$CERT" ]]; then
  CERT=$(aws acm request-certificate --domain-name "$DOMAIN" --validation-method DNS --tags Key=Project,Value="$PROJECT" --query CertificateArn --output text)
fi
VAL_NAME=""; VAL_VALUE=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  VAL_NAME=$(aws acm describe-certificate --certificate-arn "$CERT" --query "Certificate.DomainValidationOptions[0].ResourceRecord.Name" --output text)
  [[ "$VAL_NAME" != "None" && -n "$VAL_NAME" ]] && break
  sleep 3
done
VAL_VALUE=$(aws acm describe-certificate --certificate-arn "$CERT" --query "Certificate.DomainValidationOptions[0].ResourceRecord.Value" --output text)
STATUS=$(aws acm describe-certificate --certificate-arn "$CERT" --query "Certificate.Status" --output text)
if [[ "$STATUS" != "ISSUED" ]]; then
  echo
  echo "צריך להוסיף אצל הרשם הנוכחי (domainthenet.com, ניהול DNS של chasamsofer.co.il) רשומה אחת:"
  echo "  סוג:  CNAME"
  echo "  שם:   $VAL_NAME"
  echo "  ערך:  $VAL_VALUE"
  echo "ההקמה ממשיכה בלי לחכות: עד שהתעודה תאומת האתר יעלה על HTTP זמני (מאחורי WAF). אחרי האימות מריצים שוב את אותה פקודה והוא עובר ל-HTTPS."
  CERT_PARAM=""
else
  CERT_PARAM="$CERT"
  echo "התעודה פעילה: $CERT"
fi

echo "== 3/4 הורדת התבנית"
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/infrastructure.yml -o /tmp/infrastructure.yml

echo "== 4/4 יצירת/עדכון הסטאק (5-10 דקות)"
# DesiredCount=${DESIRED:-0}: 0 בהקמה. אחרי הזנת הסוד ודחיפת image: DESIRED=1 (שרת אחד בלבד!)
# CreateOidcProvider: provider של GitHub הוא אחד לחשבון. בפרויקט שני ואילך (או בעדכון) לא יוצרים אותו שוב.
OIDC=true
EXISTING_OIDC=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn,'token.actions.githubusercontent.com')].Arn | [0]" --output text)
if [[ "$EXISTING_OIDC" != "None" && -n "$EXISTING_OIDC" ]]; then OIDC=false; fi
# מחסנית שנכשלה בהקמה ראשונה נשארת ב-ROLLBACK_COMPLETE ואי אפשר לעדכן אותה: מוחקים רק במצב הזה (הסוד ב-Secrets Manager לא נמחק)
STACK_STATE=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].StackStatus" --output text 2>/dev/null || true)
if [[ "$STACK_STATE" == "ROLLBACK_COMPLETE" ]]; then
  echo "המחסנית $STACK במצב ROLLBACK_COMPLETE (הקמה שנכשלה). סיבת הכשל:"
  aws cloudformation describe-stack-events --stack-name "$STACK" --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" --output text || true
  echo "מוחק את המחסנית כדי להקים מחדש."
  aws cloudformation delete-stack --stack-name "$STACK"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK"
  OIDC=true
  EXISTING_OIDC=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn,'token.actions.githubusercontent.com')].Arn | [0]" --output text)
  if [[ "$EXISTING_OIDC" != "None" && -n "$EXISTING_OIDC" ]]; then OIDC=false; fi
fi
if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  # בעדכון חוזר שומרים את הערך שהסטאק נוצר איתו
  OIDC=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='CreateOidcProvider'].ParameterValue" --output text)
  EXISTING_OIDC=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Parameters[?ParameterKey=='ExistingOidcProviderArn'].ParameterValue" --output text)
fi
[[ "$EXISTING_OIDC" == "None" ]] && EXISTING_OIDC=""
aws cloudformation deploy --stack-name "$STACK" --template-file /tmp/infrastructure.yml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags Project="$PROJECT" \
  --parameter-overrides ProjectName="$PROJECT" GitHubRepo="$REPO" DomainName="$DOMAIN" CreateDnsZone="$CREATE_ZONE" CertificateArn="$CERT_PARAM" \
    CertValidationName="$VAL_NAME" CertValidationValue="$VAL_VALUE" \
    VpcId="$VPC" SubnetIds="$SUBNETS" DesiredCount="${DESIRED:-0}" TaskCpu="${CPU:-512}" TaskMemory="${MEMORY:-1024}" CreateOidcProvider="$OIDC" ExistingOidcProviderArn="$EXISTING_OIDC" || {
  echo "ההקמה נכשלה. סיבת הכשל:"
  aws cloudformation describe-stack-events --stack-name "$STACK" --query "StackEvents[?contains(ResourceStatus,'FAILED')].[LogicalResourceId,ResourceStatusReason]" --output text || true
  exit 1
}

echo
echo "== סיום. תוצאות (אין בהן סודות):"
aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
ALB=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)
echo
if [[ "$CREATE_ZONE" == "true" ]]; then
  echo "מעבר סופי: מעתיקים את כל רשומות ה-DNS הקיימות ל-Route 53, ורק אז מחליפים שרתי שמות אצל הרשם (NameServers למעלה)."
else
  echo "מצב ביניים. צריך להוסיף אצל הרשם (domainthenet.com) רשומה שנייה, שמפנה את התת-דומיין למאזן:"
  echo "  סוג:  CNAME"
  echo "  שם:   $DOMAIN"
  echo "  ערך:  $ALB"
  SCHEME=https; [[ -z "$CERT_PARAM" ]] && SCHEME=http
  echo "בדיקה מיידית (גם לפני הוספת הרשומה): curl -sk -H 'Host: $DOMAIN' $SCHEME://$ALB/api/health"
  [[ -z "$CERT_PARAM" ]] && echo "הערה: התעודה עוד לא אומתה, והאתר על HTTP זמני. אחרי שהרשומה בענן האפור (DNS only) מאומתת, מריצים שוב את אותה פקודה כדי לעבור ל-HTTPS."
  echo "הדומיין הראשי והמייל לא משתנים."
fi
echo "שלבים הבאים: 1) מזינים את משתני הסביבה בסוד $PROJECT/prod (Secrets Manager)"
echo "             2) מריצים ב-GitHub את הפריסה (העלאת image), ואז שוב כאן עם DESIRED=1 (שרת אחד בלבד, בגלל התזמונים הפנימיים)"
echo "             3) בודקים את https://$DOMAIN/api/health"
echo "פירוט מלא: aws/MIGRATE-CHASAMSOFER.md"
