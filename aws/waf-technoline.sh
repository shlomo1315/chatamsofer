#!/usr/bin/env bash
# מתקן את ה-WAF החי כך שהמרכזיה של טכנוליין (שולחת בלי User-Agent) תגיע ל-webhook.
# זהה לשינוי ב-infrastructure.yml: NoUserAgent_HEADER רק מסמן, והכלל no-user-agent חוסם
# בקשות בלי User-Agent בכל נתיב חוץ מ-/api/webhooks/technoline/. הרצה ב-CloudShell: bash aws/waf-technoline.sh
set -euo pipefail
REGION=${AWS_REGION:-eu-central-1}
read -r NAME ID < <(aws wafv2 list-web-acls --scope REGIONAL --region "$REGION" --query 'WebACLs[0].[Name,Id]' --output text)
aws wafv2 get-web-acl --scope REGIONAL --region "$REGION" --name "$NAME" --id "$ID" > /tmp/acl.json
node -e '
const j=require("/tmp/acl.json"), a=j.WebACL
const g=a.Rules.find(r=>r.Name==="common").Statement.ManagedRuleGroupStatement
g.RuleActionOverrides=g.RuleActionOverrides||[]
if(!g.RuleActionOverrides.some(o=>o.Name==="NoUserAgent_HEADER")) g.RuleActionOverrides.push({Name:"NoUserAgent_HEADER",ActionToUse:{Count:{}}})
if(!a.Rules.some(r=>r.Name==="no-user-agent")) a.Rules.push({Name:"no-user-agent",Priority:6,Action:{Block:{}},
  Statement:{AndStatement:{Statements:[
    {LabelMatchStatement:{Scope:"LABEL",Key:"awswaf:managed:aws:core-rule-set:NoUserAgent_Header"}},
    {NotStatement:{Statement:{ByteMatchStatement:{SearchString:"/api/webhooks/technoline/",FieldToMatch:{UriPath:{}},PositionalConstraint:"STARTS_WITH",TextTransformations:[{Priority:0,Type:"NONE"}]}}}}]}},
  VisibilityConfig:{SampledRequestsEnabled:true,CloudWatchMetricsEnabled:true,MetricName:"no-user-agent"}})
const out={Name:a.Name,Scope:"REGIONAL",Id:a.Id,DefaultAction:a.DefaultAction,Rules:a.Rules,VisibilityConfig:a.VisibilityConfig,LockToken:j.LockToken}
for (const k of ["Description","CustomResponseBodies","CaptchaConfig","ChallengeConfig","TokenDomains","AssociationConfig"]) if (a[k]) out[k]=a[k]
require("fs").writeFileSync("/tmp/acl-new.json",JSON.stringify(out))'
aws wafv2 update-web-acl --region "$REGION" --cli-input-json file:///tmp/acl-new.json
echo "✅ ה-WAF עודכן. טכנוליין יכולה להגיע ל-webhook."
