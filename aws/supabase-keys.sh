#!/usr/bin/env bash
# ב-CloudShell: מייצר מפתחות JWT וסיסמאות לתפקידי המסד ושומר ב-chasamsofer/supabase-gw. שום ערך לא מודפס.
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/supabase-keys.sh?$(date +%s)")
# בטוח להרצה חוזרת: מפתחות וסיסמאות קיימים נשמרים (FORCE=1 להחלפה), וכתובות החיבור ותעודת ה-CA של RDS מתעדכנות תמיד.
set -euo pipefail
R=eu-central-1; P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}
export AWS_DEFAULT_REGION=$R
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
CUR=$(aws secretsmanager get-secret-value --secret-id "$P/supabase-gw" --query SecretString --output text)
DBH=$(out DbEndpoint)
# Storage מאמת את תעודת RDS במלואה (שם שרת ושרשרת) מול החבילה של האזור
CA=$(curl -fsSL "https://truststore.pki.rds.amazonaws.com/$R/$R-bundle.pem")
grep -q 'BEGIN CERTIFICATE' <<<"$CA" || { echo "הורדת תעודת ה-CA של RDS נכשלה"; exit 1; }
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { local h p s; h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64); p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$(date +%s)" "$(( $(date +%s) + 315360000 ))" | b64)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64); printf '%s.%s.%s' "$h" "$p" "$s"; }
rnd() { openssl rand -hex 24; }
if [ -z "$(jq -r '.jwt_secret // empty' <<<"$CUR")" ] || [ "${FORCE:-}" = 1 ]; then
  JWT=$(openssl rand -hex 32)
  CUR=$(jq --arg j "$JWT" --arg an "$(jwt anon "$JWT")" --arg sv "$(jwt service_role "$JWT")" \
    --arg a "$(rnd)" --arg b "$(rnd)" --arg c "$(rnd)" \
    '.jwt_secret=$j | .anon_key=$an | .service_key=$sv | .authenticator_pw=$a | .auth_admin_pw=$b | .storage_admin_pw=$c' <<<"$CUR")
  unset JWT; echo "נוצרו מפתחות וסיסמאות חדשים"
else
  echo "המפתחות כבר קיימים ונשמרו (FORCE=1 להחלפה, יבטל את ההתחברויות הקיימות)"
fi
# ב-storage_url אין sslmode: הוא דורס ב-node-pg את התעודה שמגיעה מ-DATABASE_SSL_ROOT_CERT
aws secretsmanager put-secret-value --secret-id "$P/supabase-gw" --secret-string "$(jq --arg h "$DBH" --arg ca "$CA" '
  .rds_ca=$ca
  | .rest_url="postgres://authenticator:\(.authenticator_pw)@\($h):5432/app?sslmode=require"
  | .auth_url="postgres://supabase_auth_admin:\(.auth_admin_pw)@\($h):5432/app?sslmode=require&search_path=auth"
  | .storage_url="postgres://supabase_storage_admin:\(.storage_admin_pw)@\($h):5432/app"' <<<"$CUR")" >/dev/null
unset CUR
echo "נשמר ב-$P/supabase-gw (בלי הדפסה)"
