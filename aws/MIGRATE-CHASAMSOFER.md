# מעבר חתם סופר מ-Railway ל-AWS: צעד אחרי צעד

Railway ממשיך לשרת את האתר עד שלב 9. עד אז אפשר לעצור בכל צעד בלי נזק.
סימון: **[אתה]** פעולה שלך בקונסולה או ב-GitHub. **[אוטומטי]** מתבצע בסקריפט.

## עלות חודשית (פרנקפורט, הערכה לפי מחירון 2026)
**מסלול זול (ברירת מחדל): בערך 30$ בחודש.** שרת אחד קטן, ו-Cloudflare Tunnel חינמי מלפנים במקום מאזן עומסים ו-WAF.

| רכיב | מסלול זול (`EDGE=tunnel`) | מסלול מאזן עומסים (`EDGE=alb`) |
|---|---|---|
| שרת Fargate אחד, חצי ליבה 1GB | 21$ | 21$ |
| מאזן עומסים (ALB) | 0 | 25$ |
| כתובות IPv4 ציבוריות | 4$ (אחת) | 15$ |
| WAF | 0 (Cloudflare) | 8$ |
| GuardDuty, CloudTrail, לוגים, ECR, סוד | 5-8$ | 5-8$ |
| **סה"כ** | **בערך 30-33$** | **בערך 75$** |

- בשרת ליבה ו-2GB (`CPU=1024 MEMORY=2048`) מוסיפים בערך 20$ לכל מסלול.
- במסלול הזול אין עלות לפני שמעלים שרת (שלב 7), כי אין ALB.
- תעבורה יוצאת עד 100GB בחודש לא עולה כסף.
- תקציב של 40$ מתאים למסלול הזול. למסלול ALB מעדכנים: `ALERT_EMAIL=... BUDGET=100 bash account-setup.sh`.

## איך זה עובד במסלול הזול
- ל-Fargate אין כתובת קבועה, ולכן לא מפנים את הדומיין ישר לשרת. בתוך אותה משימה רץ קונטיינר `cloudflared` שיוצר חיבור **יוצא** אל Cloudflare. ה-HTTPS וחומת האבטחה מסופקים על ידי Cloudflare.
- ל-security group של השרת **אין אף כלל כניסה**. אי אפשר להגיע לשרת ישירות מהאינטרנט, רק דרך ה-Tunnel.
- הטוקן של ה-Tunnel יושב ב-Secrets Manager במפתח `CLOUDFLARE_TUNNEL_TOKEN`, לא במשתני סביבה גלויים.
- הגדלה בעתיד: `EDGE=alb bash cloudshell-setup.sh` (עדכון של אותו סטאק) מוסיף ALB ו-WAF ומוריד את ה-Tunnel. אחר כך מפנים את ה-DNS ל-`AlbDnsName` ומבצעים שלב 8.

## שלב 1: חשבון ו-root [אתה]
פותחים חשבון, מפעילים אימות דו-שלבי ל-root, יוצרים משתמש יומיומי ונכנסים איתו. בדיוק לפי `aws/ACCOUNT-SETUP.md`, שלבים 1 ו-2.

## שלב 2: מעטפת תקציב ואבטחה (פעם אחת לכל החשבון) [אתה]
ב-CloudShell באזור Frankfurt:
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/account-setup.sh -o account-setup.sh
ALERT_EMAIL=המייל-שלך@example.com BUDGET=40 bash account-setup.sh
```
מאשרים במייל את "Subscription Confirmation". לא מריצים שוב לפרויקטים נוספים.

## שלב 3: הקמת התשתית של חתם סופר [אתה, פקודה אחת]
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/cloudshell-setup.sh -o cloudshell-setup.sh
bash cloudshell-setup.sh
```
- נוצר סטאק `chasamsofer` עם תגית `Project=chasamsofer`: ECR, ECS, לוגים (30 יום), סוד, והרשאת פריסה מ-GitHub בלי מפתחות.
- `DesiredCount=0`: עדיין אין שרת, כי אין תמונה.
- ברירת המחדל: חצי ליבה, 1GB, מסלול זול. להגדלה: `CPU=1024 MEMORY=2048 bash cloudshell-setup.sh`, ואת אותם ערכים מוסיפים בכל הרצה חוזרת (שלבים 7 ו-8).
- בסוף מודפס `DeployRoleArn`. שומרים אותו.

## שלב 3א: Cloudflare Tunnel [אתה]
1. חשבון חינמי ב-cloudflare.com > Add a site > `chasamsofer.co.il` > תוכנית Free. Cloudflare מציג שני שרתי שמות (nameservers).
2. ב-domainthenet.com מחליפים את שרתי השמות של הדומיין לשניים האלה. **עד שהדומיין פעיל ב-Cloudflare האתר ממשיך לעבוד כרגיל מ-Railway** (Cloudflare מעתיק את רשומות ה-DNS הקיימות, לכן בודקים שכולן הועתקו, כולל MX ו-TXT של המייל).
3. Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared > שם `chasamsofer`. מעתיקים את **הטוקן** (המחרוזת אחרי `--token`).
4. באותו מסך, Public Hostname לבדיקה: `aws.chasamsofer.co.il`, Type `HTTP`, URL `localhost:3000`. את הדומיין הראשי (`chasamsofer.co.il` ו-`www`) מוסיפים רק בשלב 8, כי הוספה שלו מעבירה את התעבורה מ-Railway.
5. SSL/TLS > Overview > מצב **Full**. Security > Settings > Security Level Medium ו-Bot Fight Mode פעיל.

## שלב 4: משתני הסביבה בסוד [אתה]
Secrets Manager (Frankfurt) > `chasamsofer/prod` > Retrieve secret value > Edit.
- ממלאים את הערכים שקיימים היום ב-Railway (Variables של שירות chasamsofer). **לא מוחקים מפתחות** מה-JSON, גם ריקים: בלי מפתח ECS נכשל.
- אל תשלח אותם בצ'אט. מעתיקים ישירות מ-Railway לקונסולה.
- `CLOUDFLARE_TUNNEL_TOKEN`: הטוקן משלב 3א. בלעדיו האתר לא נגיש.
- `NEDARIM_PROXY_URL`: משאירים כפי שהוא ב-Railway כל עוד `nedarim-proxy` שם.

## שלב 5: חיבור GitHub לפריסה אוטומטית [אתה]
1. מעבירים את `aws/deploy-aws.yml` ל-`.github/workflows/deploy-aws.yml`. בגיטהאב: Add file > Create new file, שם `.github/workflows/deploy-aws.yml`, מדביקים את התוכן ועושים commit ל-`main`. (לסוכנים אין הרשאה לכתוב לשם.)
2. Settings > Secrets and variables > Actions:
   - **Secret** `AWS_DEPLOY_ROLE_ARN` = הערך `DeployRoleArn` משלב 3.
   - **Variables:**

     | שם | ערך |
     |---|---|
     | `AWS_DEPLOY_ENABLED` | `true` |
     | `AWS_REGION` | `eu-central-1` |
     | `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_TASK_FAMILY` | `chasamsofer` (כולם) |
     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | אותם ערכים כמו ב-Railway |
     | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | בשלב הבדיקה: `https://aws.chasamsofer.co.il` (במסלול ALB: `http://<AlbDnsName>`) |

   **חשוב:** ערכי `NEXT_PUBLIC_*` נצרבים בתוך התמונה בזמן הבנייה. כשעוברים לדומיין (שלב 8) מחליפים אותם ל-`https://chasamsofer.co.il` ומריצים פריסה מחדש.

## שלב 6: העלאת התמונה הראשונה [אתה]
GitHub > Actions > "פריסה ל-AWS" > Run workflow (ענף main). הפריסה בונה, מעלה ל-ECR ורושמת הגדרת משימה. בשלב הזה ייתכן שהשלב האחרון (המתנה ליציבות) יסתיים מיד כי `DesiredCount=0`, וזה תקין.

## שלב 7: הרמת שרת אחד [אתה, פקודה אחת]
```bash
DESIRED=1 bash cloudshell-setup.sh
```
- **שרת אחד בלבד, תמיד.** `instrumentation.ts` מריץ תזמונים פנימיים (גיבוי, פריקה, סנכרונים), ושתי משימות היו מריצות אותם פעמיים. אל תעלה את `DesiredCount` מעל 1.
- בודקים בדפדפן `https://aws.chasamsofer.co.il/api/health` (מצופה 200; במסלול ALB: `http://<AlbDnsName>/api/health`) ואז את האתר, התחברות ופעולה אחת בכל מסך מרכזי.
- בזמן הבדיקה שני השרתים (Railway ו-AWS) מריצים תזמונים. כדי לא להכפיל גיבויים ושליחות, לפני בדיקה ארוכה מפעילים באחד מהם את משתני ה-`*_DISABLED` מהרשימה בסוד (למשל `DAILY_BACKUP_DISABLED=true` ב-AWS) ומסירים אותם ביום המעבר.

## שלב 8: דומיין ומעבר [אתה]
**מסלול זול (Tunnel):** התעודה וה-HTTPS ניתנים על ידי Cloudflare, בלי ACM.
1. **משתנים:** מחליפים ב-GitHub את `NEXT_PUBLIC_SITE_URL` ו-`NEXT_PUBLIC_APP_URL` ל-`https://chasamsofer.co.il`, ובסוד את `GMAIL_REDIRECT_URI` (ובהתאם ב-Google Cloud). מריצים פריסה מחדש.
2. **מעבר:** ב-Cloudflare, בתוך ה-Tunnel, מוסיפים Public Hostname ל-`chasamsofer.co.il` ול-`www` (HTTP, `localhost:3000`). Cloudflare מחליף את רשומות האתר ל-Tunnel, והתעבורה עוברת לאמזון. לחזרה מהירה ל-Railway מחזירים את הרשומה הקודמת.
3. **Webhooks:** בודקים שכתובות Yemot, Resend ו-Gmail PubSub מצביעות לדומיין.
4. **תזמון חיצוני:** `/api/cron/name-reminders` רץ היום כשירות נפרד ב-Railway (`cron-name-reminders`). צריך להעביר לי את הלוח שלו כדי להקים EventBridge Scheduler. עד אז לא מכבים אותו.

**מסלול ALB (אם עוברים אליו):**
1. תעודה ב-Certificate Manager (Frankfurt) לדומיין, אימות DNS, והעתקת ה-ARN.
2. `EDGE=alb CERT=<ה-ARN> DESIRED=1 bash cloudshell-setup.sh`.
3. DNS ל-CNAME אל `AlbDnsName` (יום קודם מורידים TTL ל-300 שניות). לדומיין ראשי בלי `www` ייתכן שהספק לא מאפשר CNAME, ואז מפנים `www` ומגדירים הפניה.
4. אותם משתנים ו-Webhooks כמו למעלה.

## שלב 9: סיום
- Railway נשאר כגיבוי כמה ימים, ואז מכבים את השירותים.
- ב-Cost Explorer (Group by Tag `Project`) רואים את עלות חתם סופר בנפרד, מ-24 שעות אחרי ההקמה.

## פרויקט נוסף בעתיד
אותו חשבון ואותה מעטפת. לכל פרויקט:
```bash
PROJECT=myapp REPO=shlomo1315/myapp DOMAIN=myapp.co.il bash cloudshell-setup.sh
```
נוצר סטאק נפרד עם תגית `Project=myapp` והרשאת פריסה שמוגבלת לריפו שלו בלבד. את `deploy-aws.yml` מעתיקים לריפו החדש עם ערכים משלו. ה-provider של GitHub הוא אחד לחשבון, והסקריפט מזהה אותו ולא יוצר שוב.
