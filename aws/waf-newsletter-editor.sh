#!/usr/bin/env bash
# מתקן את ה-WAF החי כך שעורך הניוזלטר (שולח HTML בשמירת קמפיין) לא ייחסם בכלל xss-body.
# זהה לשינוי ב-infrastructure.yml: החריג של xss-body מורחב מ-/api/admin/gilyonot/ גם ל-/api/admin/campaigns/.
# שאר כללי ה-common נשארים פעילים גם שם, והנתיב דורש מנהל מחובר עם הרשאת ניוזלטר.
set -euo pipefail
REGION=${AWS_REGION:-eu-central-1}
read -r NAME ID < <(aws wafv2 list-web-acls --scope REGIONAL --region "$REGION" --query 'WebACLs[0].[Name,Id]' --output text)
aws wafv2 get-web-acl --scope REGIONAL --region "$REGION" --name "$NAME" --id "$ID" > /tmp/acl.json
node -e '
const j=require("/tmp/acl.json"), a=j.WebACL
const prefix=p=>({ByteMatchStatement:{SearchString:Buffer.from(p).toString("base64"),FieldToMatch:{UriPath:{}},PositionalConstraint:"STARTS_WITH",TextTransformations:[{Priority:0,Type:"NONE"}]}})
const r=a.Rules.find(r=>r.Name==="xss-body")
if(!r) throw new Error("הכלל xss-body לא קיים. הרץ קודם את aws/waf-gilyonot-editor.sh")
const not=r.Statement.AndStatement.Statements.find(s=>s.NotStatement).NotStatement
not.Statement={OrStatement:{Statements:[prefix("/api/admin/gilyonot/"),prefix("/api/admin/campaigns/")]}}
const out={Name:a.Name,Scope:"REGIONAL",Id:a.Id,DefaultAction:a.DefaultAction,Rules:a.Rules,VisibilityConfig:a.VisibilityConfig,LockToken:j.LockToken}
for (const k of ["Description","CustomResponseBodies","CaptchaConfig","ChallengeConfig","TokenDomains","AssociationConfig"]) if (a[k]) out[k]=a[k]
require("fs").writeFileSync("/tmp/acl-new.json",JSON.stringify(out))'
aws wafv2 update-web-acl --region "$REGION" --cli-input-json file:///tmp/acl-new.json
echo "✅ ה-WAF עודכן. עורך הניוזלטר יכול לשמור HTML."
