#!/usr/bin/env bash
# מתקן את ה-WAF החי כך שעורך מייל הגיליונות (שולח HTML) לא ייחסם ב-CrossSiteScripting_BODY.
# זהה לשינוי ב-infrastructure.yml: הכלל המנוהל רק מסמן, והכלל xss-body חוסם XSS בגוף הבקשה
# בכל נתיב חוץ מ-/api/admin/gilyonot/. שאר כללי ה-common נשארים פעילים גם שם.
set -euo pipefail
REGION=${AWS_REGION:-eu-central-1}
read -r NAME ID < <(aws wafv2 list-web-acls --scope REGIONAL --region "$REGION" --query 'WebACLs[0].[Name,Id]' --output text)
aws wafv2 get-web-acl --scope REGIONAL --region "$REGION" --name "$NAME" --id "$ID" > /tmp/acl.json
node -e '
const j=require("/tmp/acl.json"), a=j.WebACL
const g=a.Rules.find(r=>r.Name==="common").Statement.ManagedRuleGroupStatement
g.RuleActionOverrides=g.RuleActionOverrides||[]
if(!g.RuleActionOverrides.some(o=>o.Name==="CrossSiteScripting_BODY")) g.RuleActionOverrides.push({Name:"CrossSiteScripting_BODY",ActionToUse:{Count:{}}})
if(!a.Rules.some(r=>r.Name==="xss-body")) a.Rules.push({Name:"xss-body",Priority:7,Action:{Block:{}},
  Statement:{AndStatement:{Statements:[
    {LabelMatchStatement:{Scope:"LABEL",Key:"awswaf:managed:aws:core-rule-set:CrossSiteScripting_Body"}},
    {NotStatement:{Statement:{ByteMatchStatement:{SearchString:Buffer.from("/api/admin/gilyonot/").toString("base64"),FieldToMatch:{UriPath:{}},PositionalConstraint:"STARTS_WITH",TextTransformations:[{Priority:0,Type:"NONE"}]}}}}]}},
  VisibilityConfig:{SampledRequestsEnabled:true,CloudWatchMetricsEnabled:true,MetricName:"xss-body"}})
const out={Name:a.Name,Scope:"REGIONAL",Id:a.Id,DefaultAction:a.DefaultAction,Rules:a.Rules,VisibilityConfig:a.VisibilityConfig,LockToken:j.LockToken}
for (const k of ["Description","CustomResponseBodies","CaptchaConfig","ChallengeConfig","TokenDomains","AssociationConfig"]) if (a[k]) out[k]=a[k]
require("fs").writeFileSync("/tmp/acl-new.json",JSON.stringify(out))'
aws wafv2 update-web-acl --region "$REGION" --cli-input-json file:///tmp/acl-new.json
echo "✅ ה-WAF עודכן. עורך מייל הגיליונות יכול לשמור HTML."
