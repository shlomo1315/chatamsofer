#!/usr/bin/env bash
# העתקה מ-Supabase (קריאה בלבד) אל RDS ו-S3 ב-AWS, כמשימת ECS חד-פעמית בתוך ה-VPC, ודוח השוואה בסוף.
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/copy-from-supabase.sh?$(date +%s)")
# דורש: הסטאק עם RDS ו-S3 (ממוזג ל-main), והסוד chasamsofer/supabase-src ממולא (fill-src-secret.sh).
# אין כתיבה, מחיקה או שינוי במקור. SCHEMAS=public (ברירת מחדל). STEP=db|files|both
set -euo pipefail
R=eu-central-1; P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}; STEP=${STEP:-both}
export AWS_DEFAULT_REGION=$R
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DBH=$(out DbEndpoint); DBS=$(out DbSecretArn); BKT=$(out FilesBucketName); SG=$(out CopySgId)
EXEC=$(aws iam get-role --role-name "$(aws ecs describe-task-definition --task-definition "$P" --query 'taskDefinition.executionRoleArn' --output text | sed 's#.*/##')" --query Role.Arn --output text)
TASK=$(aws ecs describe-task-definition --task-definition "$P" --query 'taskDefinition.taskRoleArn' --output text)
SRC=$(aws secretsmanager describe-secret --secret-id "$P/supabase-src" --query ARN --output text)
APP=$(aws secretsmanager describe-secret --secret-id "$P/prod" --query ARN --output text)
SUBS=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SB_URL=$(aws ecs describe-task-definition --task-definition "$P" --query "taskDefinition.containerDefinitions[0].environment[?name=='NEXT_PUBLIC_SUPABASE_URL'].value" --output text)
aws logs create-log-group --log-group-name "/ecs/$P-copy" 2>/dev/null || true

run() { # name image command-json environment-json secrets-json
  local td; td=$(aws ecs register-task-definition --family "$P-copy-$1" --requires-compatibilities FARGATE --network-mode awsvpc \
    --cpu 1024 --memory 4096 --ephemeral-storage sizeInGiB=100 --execution-role-arn "$EXEC" --task-role-arn "$TASK" \
    --container-definitions "[{\"name\":\"c\",\"image\":\"$2\",\"essential\":true,\"entryPoint\":[\"sh\",\"-c\"],\"command\":[$3],\"environment\":$4,\"secrets\":$5,\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/$P-copy\",\"awslogs-region\":\"$R\",\"awslogs-stream-prefix\":\"$1\"}}}]" \
    --query taskDefinition.taskDefinitionArn --output text)
  local arn; arn=$(aws ecs run-task --cluster "$P" --launch-type FARGATE --task-definition "$td" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBS],securityGroups=[$SG],assignPublicIp=ENABLED}" --query 'tasks[0].taskArn' --output text)
  echo "משימה $1 רצה..."; aws ecs wait tasks-stopped --cluster "$P" --tasks "$arn"
  local code; code=$(aws ecs describe-tasks --cluster "$P" --tasks "$arn" --query 'tasks[0].containers[0].exitCode' --output text)
  local id=${arn##*/}
  aws logs get-log-events --log-group-name "/ecs/$P-copy" --log-stream-name "$1/c/$id" --query 'events[].message' --output text | tr '\t' '\n' | grep '^REPORT' | column -t -s'|' || true
  [ "$code" = 0 ] || { echo "נכשל ($code). לוג: /ecs/$P-copy"; exit 1; }
}

if [ "$STEP" != files ]; then
  CMD=$(jq -Rs . < <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/copy-db.sh"))
  run db postgres:17 "$CMD" "[{\"name\":\"DST_HOST\",\"value\":\"$DBH\"},{\"name\":\"SCHEMAS\",\"value\":\"${SCHEMAS:-public}\"}]" \
    "[{\"name\":\"SRC_HOST\",\"valueFrom\":\"$SRC:host::\"},{\"name\":\"SRC_USER\",\"valueFrom\":\"$SRC:user::\"},{\"name\":\"SRC_PASS\",\"valueFrom\":\"$SRC:password::\"},{\"name\":\"DST_USER\",\"valueFrom\":\"$DBS:username::\"},{\"name\":\"DST_PASS\",\"valueFrom\":\"$DBS:password::\"}]"
fi
if [ "$STEP" != db ]; then
  JS=$(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/copy-files.mjs" | base64 -w0)
  run files node:22-slim "$(jq -Rn --arg js "$JS" '"mkdir /w && cd /w && npm i --silent @aws-sdk/client-s3 && echo \($js) | base64 -d > c.mjs && node c.mjs"')" \
    "[{\"name\":\"SUPABASE_URL\",\"value\":\"$SB_URL\"},{\"name\":\"FILES_BUCKET\",\"value\":\"$BKT\"}]" \
    "[{\"name\":\"SUPABASE_SERVICE_ROLE_KEY\",\"valueFrom\":\"$APP:SUPABASE_SERVICE_ROLE_KEY::\"}]"
fi
