# מעבר ל-AWS (ECS Fargate) — מדריך הקמה

Railway נשאר פעיל ותקין עד שהמעבר מסתיים (`railway.json` לא נגע). הבנייה ל-AWS מופעלת רק עם `BUILD_STANDALONE=1` (ה-Dockerfile מגדיר זאת).

## מה כבר בקוד
- `Dockerfile` + `.dockerignore`: Next.js standalone, Debian slim (בגלל `@napi-rs/canvas`), משתמש לא-root, healthcheck על `/api/health`.
- `.github/workflows/deploy-aws.yml`: בכל מיזוג ל-main — build, העלאה ל-ECR, ופריסה ל-ECS (rolling). אימות דרך OIDC, בלי מפתחות. לא רץ עד שמגדירים `AWS_DEPLOY_ENABLED=true`.
- קבצים: הקוד **לא** כותב לדיסק המקומי (קריאה בלבד מ-`public/`; מסמכים נשמרים ב-Supabase). לכן אין צורך ב-S3 כרגע. התיקייה `uploads` בעותק העבודה אינה חלק מהקוד.
- מזהה גרסה: `APP_BUILD_ID` (ה-SHA של הקומיט) מחליף את `RAILWAY_DEPLOYMENT_ID`.

## צעדי הקמה (פעם אחת, בקונסולת AWS)
1. חשבון AWS + MFA על המשתמש הראשי. אזור מומלץ: `eu-central-1` או `il-central-1`.
2. **ECR**: ליצור repository בשם `chasamsofer`.
3. **Secrets Manager**: ליצור סוד אחד `chasamsofer/prod` (JSON) עם כל המשתנים הסודיים מהרשימה למטה.
4. **ECS**: Cluster `chasamsofer`, Task Definition בשם `chasamsofer` עם קונטיינר בשם **`app`**, פורט 3000, 1 vCPU / 2GB, והמשתנים מוזרקים מ-Secrets Manager. Service עם 2 משימות מאחורי Application Load Balancer, health check על `/api/health`.
5. **ACM**: תעודה ל-`chasamsofer.co.il` (אימות DNS), מחוברת ל-ALB על 443. Security Group: רק 443 פתוח לעולם; המשימות מקבלות תעבורה מה-ALB בלבד. WAF בסיסי (AWS managed rules) על ה-ALB.
6. **OIDC ל-GitHub**: IAM Identity Provider ל-`token.actions.githubusercontent.com`, ו-Role בשם `chasamsofer-deployer` שמוגבל לריפו `shlomo1315/chatamsofer` ולענף main, עם הרשאות ECR push, ‏`ecs:RegisterTaskDefinition`/`UpdateService`/`DescribeServices` ו-`iam:PassRole` לתפקידי המשימה.
7. **ב-GitHub → Settings → Secrets and variables → Actions**:
   - Secret: `AWS_DEPLOY_ROLE_ARN`
   - Variables: `AWS_DEPLOY_ENABLED=true`, `AWS_REGION`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_TASK_FAMILY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`
8. **קרונים (EventBridge Scheduler)** — קריאת HTTPS עם `?secret=<CRON_SECRET>` (או כותרת, לפי הנתיב) ל:
   `/api/cron/backup`, `/api/cron/book-fair-cleanup`, `/api/cron/daily-digest`, `/api/cron/gov-sync`, `/api/cron/holiday-load-audit`, `/api/cron/name-reminders`, `/api/cron/nedarim-groups`, `/api/nedarim/unload-expired`. התדירויות כמו ב-Railway (שירות `cron-name-reminders` ושאר שירותי ה-curl).
9. **נדרים proxy**: אם נדרים דורשת IP קבוע — NAT Gateway עם Elastic IP לשירות, או להשאיר את `nedarim-proxy` זמנית ב-Railway ולהצביע אליו דרך `NEDARIM_PROXY_URL`.

## מעבר
1. פריסה ראשונה ובדיקה על כתובת ה-ALB הזמנית (צ'קליסט בסוף `RAILWAY_MIGRATION.md`, שלב 7).
2. עדכון `NEXT_PUBLIC_SITE_URL`, ‏`NEXT_PUBLIC_APP_URL`, ‏`GMAIL_REDIRECT_URI` ו-redirect ב-Google Cloud, ו-webhooks של Yemot/Resend/Gmail PubSub לדומיין.
3. החלפת DNS של `chasamsofer.co.il` ל-ALB (TTL נמוך מראש).
4. Railway נשאר כגיבוי כמה ימים, ואז מכבים.

## משתני סביבה (שמות בלבד; מי שסודי — ב-Secrets Manager)
```
ANTHROPIC_API_KEY
APP_BUILD_ID
BOOK_FAIR_AUTO_OPEN_DISABLED
BOOK_FAIR_CLEANUP_DISABLED
CRON_SECRET
DAILY_BACKUP_DISABLED
DISTRIBUTIONS_PORTAL_SECRET
ELEVENLABS_API_KEY
ELEVENLABS_MODEL_ID
ELEVENLABS_VOICE_ID
GILYONOT_DISABLED
GILYONOT_FROM_EMAIL
GILYONOT_NEDARIM_TOKEN
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_EMAIL
GMAIL_PUBSUB_TOPIC
GMAIL_PUSH_TOKEN
GMAIL_REDIRECT_URI
GMAIL_WATCH_RENEW_DISABLED
GOOGLE_DRIVE_BACKUP_FOLDER_ID
GOOGLE_SA_KEY
GOV_SYNC_DISABLED
KVITEL_MAILBOX
KVITEL_NEDARIM_TOKEN
LEGACY_SYNC_DISABLED
LIVE_BALANCES_DISABLED
LIVE_BALANCES_ENABLED
LOANS_PORTAL_SECRET
LOANS_REPORT_DISABLED
MAIL_DOMAIN
MATERNITY_CARD_RETRY_DISABLED
NEDARIM_API_PASSWORD
NEDARIM_CREATE_TXN_URL
NEDARIM_GUARD_ALERT_TO
NEDARIM_HISTORY_URL
NEDARIM_HOLIDAY_LIMITED_ID
NEDARIM_MATERNITY_LIMITED_ID
NEDARIM_MOSAD_ID
NEDARIM_PROXY_URL
NEWSLETTER_DISABLED
NEXTAUTH_SECRET
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
OTP_NONCE_SECRET
RABBI_FORM_BLANK_URL
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
RESEND_WEBHOOK_SIGNING_SECRET
SCHEDULED_MAIL_DISABLED
SUPABASE_SERVICE_ROLE_KEY
UNLOAD_EXPIRED_DISABLED
VERIFY_FROM_EMAIL
VERIFY_FROM_NAME
VOICE_REBUILD_DISABLED
YEMOT_ANNOUNCE_TEMPLATE_ID
YEMOT_API_TOKEN
YEMOT_BOOK_FAIR_AUDIO
YEMOT_BOOK_FAIR_CALLER_ID
YEMOT_BOOK_FAIR_CREDIT_TEMPLATE_ID
YEMOT_BOOK_FAIR_EXT
YEMOT_BOOK_FAIR_TEXT_ONLY
YEMOT_BOOK_FAIR_TOKEN
YEMOT_CREDITS_FALLBACK_FOLDER
YEMOT_CREDITS_SECRET
YEMOT_FOLDER_HOLIDAY
YEMOT_FOLDER_IVR_FILES
YEMOT_FOLDER_MATERNITY
YEMOT_GILYONOT_SECRET
YEMOT_HOLIDAY_EXT
YEMOT_KVITEL_SECRET
YEMOT_MATERNITY_EXT
YEMOT_MENU_EXT
YEMOT_OTP_CALLER_ID
YEMOT_OTP_DIGIT_SEP
YEMOT_OTP_TEMPLATE_ID
YEMOT_SINGLE_ENDPOINT
YEMOT_TOKEN
YEMOT_WEBHOOK_SECRET
```

פירוט מה כל משתנה עושה נמצא ב-`ENV_VARS.md`. משתנים שמתחילים ב-`NEXT_PUBLIC_` נצרבים בבנייה (GitHub Variables), כל השאר בזמן ריצה.
