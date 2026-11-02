#!/usr/bin/env bash
# הקמת פרויקט ב-AWS (ECS Fargate) מתבנית אחת. מדביקים ב-CloudShell (Frankfurt). בלי מפתחות.
# ברירת המחדל היא חתם סופר. לפרויקט אחר: PROJECT=<שם> REPO=<owner/repo> DOMAIN=<דומיין> bash cloudshell-setup.sh
# ברירת המחדל: מסלול זול (בערך 30$ בחודש). שרת קטן (CPU=512 MEMORY=1024) ו-Cloudflare Tunnel מלפנים, בלי ALB ובלי WAF.
# להגדלה: CPU=1024 MEMORY=2048. בהרצה חוזרת חובה לציין את הגודל שוב, אחרת חוזר לברירת המחדל.
# חזרה למאזן עומסים ו-WAF (בערך 75$ בחודש): EDGE=alb. בדיקה בלי דומיין: בלי CERT, HTTP על כתובת ה-ALB. HTTPS: CERT=<arn של תעודת ACM>. בעדכון של אותו סטאק.
set -euo pipefail
export AWS_DEFAULT_REGION=eu-central-1
PROJECT="${PROJECT:-chasamsofer}"
REPO="${REPO:-shlomo1315/chatamsofer}"
DOMAIN="${DOMAIN:-chasamsofer.co.il}"
STACK="${STACK:-$PROJECT}"
CERT="${CERT:-}"
EDGE="${EDGE:-tunnel}"
[[ "$EDGE" == "tunnel" || "$EDGE" == "alb" ]] || { echo "EDGE חייב להיות tunnel או alb"; exit 1; }
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
  --parameter-overrides ProjectName="$PROJECT" GitHubRepo="$REPO" DomainName="$DOMAIN" CertificateArn="$CERT" EdgeMode="$EDGE" \
    VpcId="$VPC" SubnetIds="$SUBNETS" DesiredCount="${DESIRED:-0}" TaskCpu="${CPU:-512}" TaskMemory="${MEMORY:-1024}" CreateOidcProvider="$OIDC" ExistingOidcProviderArn="$EXISTING_OIDC"

echo
echo "== סיום. תוצאות (אין בהן סודות):"
aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
if [[ "$EDGE" == "alb" ]]; then
  ALB=$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)
  echo
  echo "כתובת בדיקה: http://$ALB"
  echo "שלבים הבאים: 1) מזינים את משתני הסביבה בסוד $PROJECT/prod (Secrets Manager)"
  echo "             2) מריצים ב-GitHub את הפריסה (העלאת image), ואז שוב כאן עם DESIRED=1 (שרת אחד בלבד, בגלל התזמונים הפנימיים)"
  echo "             3) בודקים http://$ALB/api/health"
else
  echo
  echo "מסלול זול (Cloudflare Tunnel): אין כתובת בדיקה ישירה, כי לשרת אין פורט פתוח."
  echo "שלבים הבאים: 1) יוצרים Tunnel ב-Cloudflare ושומרים את הטוקן שלו בסוד $PROJECT/prod במפתח CLOUDFLARE_TUNNEL_TOKEN"
  echo "             2) מזינים את שאר משתני הסביבה בסוד, ומריצים ב-GitHub את הפריסה"
  echo "             3) מריצים שוב כאן עם DESIRED=1 (שרת אחד בלבד), ובודקים https://$DOMAIN/api/health"
  echo "פירוט מלא: aws/MIGRATE-CHASAMSOFER.md"
fi
