#!/usr/bin/env bash
# ב-CloudShell: מייצר מפתחות JWT וסיסמאות לתפקידי המסד ושומר ב-chasamsofer/supabase-gw. שום ערך לא מודפס.
#   bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/supabase-keys.sh?$(date +%s)")
# מריצים פעם אחת. הרצה חוזרת נעצרת, כדי לא להחליף מפתחות (FORCE=1 להחלפה).
set -euo pipefail
R=eu-central-1; P=${PROJECT:-chasamsofer}; STACK=${STACK:-$P}
export AWS_DEFAULT_REGION=$R
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
CUR=$(aws secretsmanager get-secret-value --secret-id "$P/supabase-gw" --query SecretString --output text | jq -r .jwt_secret)
[ -z "$CUR" ] || [ "${FORCE:-}" = 1 ] || { echo "המפתחות כבר קיימים. FORCE=1 להחלפה (יבטל את ההתחברויות הקיימות)."; exit 0; }
DBH=$(out DbEndpoint)
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { local h p s; h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64); p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$(date +%s)" "$(( $(date +%s) + 315360000 ))" | b64)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64); printf '%s.%s.%s' "$h" "$p" "$s"; }
rnd() { openssl rand -hex 24; }
JWT=$(openssl rand -hex 32); ANON=$(jwt anon "$JWT"); SERVICE=$(jwt service_role "$JWT")
A=$(rnd); B=$(rnd); C=$(rnd)
aws secretsmanager put-secret-value --secret-id "$P/supabase-gw" --secret-string "$(jq -n \
  --arg j "$JWT" --arg an "$ANON" --arg sv "$SERVICE" --arg a "$A" --arg b "$B" --arg c "$C" --arg h "$DBH" '{
  jwt_secret:$j, anon_key:$an, service_key:$sv, authenticator_pw:$a, auth_admin_pw:$b, storage_admin_pw:$c,
  rest_url:"postgres://authenticator:\($a)@\($h):5432/app?sslmode=require",
  auth_url:"postgres://supabase_auth_admin:\($b)@\($h):5432/app?sslmode=require&search_path=auth",
  storage_url:"postgres://supabase_storage_admin:\($c)@\($h):5432/app?sslmode=require&search_path=storage"}')" >/dev/null
echo "נשמר ב-$P/supabase-gw (בלי הדפסה). הבא: copy-from-supabase.sh"
