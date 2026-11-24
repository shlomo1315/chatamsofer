#!/usr/bin/env bash
# מתקן את ה-WAF החי כך שעורך "הודעה על תקלה בסדר הדורות" (שולח HTML בתצוגה ובשמירת הנוסח) לא ייחסם בכלל xss-body.
# זהה לשינוי ב-infrastructure.yml: החריג של xss-body מורחב גם ל-/api/admin/beneficiaries/lineage-fault-notice.
# הנתיב המדויק בלבד, לא כל /api/admin/beneficiaries/. שאר כללי ה-common נשארים פעילים,
# הנתיב דורש מנהל מחובר עם הרשאת lineage/edit, והשרת מנקה את ה-HTML (sanitizeMailHtml) בכל בניית מייל.
set -euo pipefail
REGION=${AWS_REGION:-eu-central-1}
read -r NAME ID < <(aws wafv2 list-web-acls --scope REGIONAL --region "$REGION" --query 'WebACLs[0].[Name,Id]' --output text)
aws wafv2 get-web-acl --scope REGIONAL --region "$REGION" --name "$NAME" --id "$ID" > /tmp/acl.json
node -e '
const j=require("/tmp/acl.json"), a=j.WebACL
const PATH="/api/admin/beneficiaries/lineage-fault-notice"
const prefix=p=>({ByteMatchStatement:{SearchString:Buffer.from(p).toString("base64"),FieldToMatch:{UriPath:{}},PositionalConstraint:"STARTS_WITH",TextTransformations:[{Priority:0,Type:"NONE"}]}})
const r=a.Rules.find(r=>r.Name==="xss-body")
if(!r) throw new Error("הכלל xss-body לא קיים. הרץ קודם את aws/waf-gilyonot-editor.sh")
const not=r.Statement.AndStatement.Statements.find(s=>s.NotStatement).NotStatement
const list=not.Statement.OrStatement ? not.Statement.OrStatement.Statements : [not.Statement]
const has=list.some(s=>s.ByteMatchStatement && Buffer.from(s.ByteMatchStatement.SearchString,"base64").toString()===PATH)
if(!has) list.push(prefix(PATH))
not.Statement={OrStatement:{Statements:list}}
const out={Name:a.Name,Scope:"REGIONAL",Id:a.Id,DefaultAction:a.DefaultAction,Rules:a.Rules,VisibilityConfig:a.VisibilityConfig,LockToken:j.LockToken}
for (const k of ["Description","CustomResponseBodies","CaptchaConfig","ChallengeConfig","TokenDomains","AssociationConfig"]) if (a[k]) out[k]=a[k]
require("fs").writeFileSync("/tmp/acl-new.json",JSON.stringify(out))'
aws wafv2 update-web-acl --region "$REGION" --cli-input-json file:///tmp/acl-new.json
echo "✅ ה-WAF עודכן. עורך ההודעה על תקלה בסדר הדורות יכול לשמור HTML."
