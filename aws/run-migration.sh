#!/usr/bin/env bash
# הרצת קובץ מיגרציה מהריפו על מסד ה-RDS, כמשימת ECS חד-פעמית בתוך ה-VPC.
#   bash aws/run-migration.sh supabase/migrations/20261115_matchmaker_grants.sql [טבלה לבדיקה ...]
# הקובץ נשלח למשימה כמשתנה סביבה ורץ ב-psql בטרנזקציה אחת עם ON_ERROR_STOP, בתור dbadmin.
# המיגרציה צריכה להיות חוזרת בבטחה (if not exists). בסוף מודפס אילו מהטבלאות שצוינו קיימות.
set -euo pipefail
FILE=${1:?"נתיב לקובץ מיגרציה"}; shift
[ -f "$FILE" ] || { echo "לא נמצא: $FILE"; exit 1; }
R=eu-central-1; P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}
export AWS_DEFAULT_REGION=$R
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DBH=$(out DbEndpoint); DBS=$(out DbSecretArn); SG=$(out CopySgId)
EXEC=$(aws ecs describe-task-definition --task-definition "$P" --query 'taskDefinition.executionRoleArn' --output text)
SUBS=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
TABLES=$(IFS=,; echo "$*")
aws logs create-log-group --log-group-name "/ecs/$P-copy" 2>/dev/null || true

CMD='printf "%s" "$MIG_SQL" | PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d app -v ON_ERROR_STOP=1 -1 -q -f - && echo "REPORT|המיגרציה רצה בהצלחה" && { [ -z "$CHECK_TABLES" ] || PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d app -At -F"|" -c "select '"'"'REPORT'"'"', t, case when to_regclass('"'"'public.'"'"'||t) is null then '"'"'חסרה'"'"' else '"'"'קיימת'"'"' end from unnest(string_to_array('"'"'$CHECK_TABLES'"'"', '"'"','"'"')) t"; }'
ENV=$(jq -n --arg sql "$(cat "$FILE")" --arg h "$DBH" --arg t "$TABLES" '[{name:"MIG_SQL",value:$sql},{name:"DB_HOST",value:$h},{name:"CHECK_TABLES",value:$t}]')
SEC=$(jq -n --arg s "$DBS" '[{name:"DB_USER",valueFrom:"\($s):username::"},{name:"DB_PASS",valueFrom:"\($s):password::"}]')
CD=$(jq -n --arg cmd "$CMD" --argjson env "$ENV" --argjson sec "$SEC" --arg g "/ecs/$P-copy" --arg r "$R" \
  '[{name:"c",image:"postgres:17",essential:true,entryPoint:["sh","-c"],command:[$cmd],environment:$env,secrets:$sec,
     logConfiguration:{logDriver:"awslogs",options:{"awslogs-group":$g,"awslogs-region":$r,"awslogs-stream-prefix":"migrate"}}}]')
TD=$(aws ecs register-task-definition --family "$P-migrate" --requires-compatibilities FARGATE --network-mode awsvpc \
  --cpu 256 --memory 512 --execution-role-arn "$EXEC" --container-definitions "$CD" --query taskDefinition.taskDefinitionArn --output text)
ARN=$(aws ecs run-task --cluster "$P" --launch-type FARGATE --task-definition "$TD" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBS],securityGroups=[$SG],assignPublicIp=ENABLED}" --query 'tasks[0].taskArn' --output text)
echo "המשימה רצה: ${ARN##*/}"
aws ecs wait tasks-stopped --cluster "$P" --tasks "$ARN"
CODE=$(aws ecs describe-tasks --cluster "$P" --tasks "$ARN" --query 'tasks[0].containers[0].exitCode' --output text)
aws logs get-log-events --log-group-name "/ecs/$P-copy" --log-stream-name "migrate/c/${ARN##*/}" --query 'events[].message' --output text | tr '\t' '\n'
[ "$CODE" = 0 ] || { echo "נכשל ($CODE). לוג: /ecs/$P-copy"; exit 1; }
