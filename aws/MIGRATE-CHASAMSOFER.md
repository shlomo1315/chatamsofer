# מעבר חתם סופר מ-Railway ל-AWS: צעד אחרי צעד

Railway ממשיך לשרת את הדומיין הראשי עד שלב 8. עד אז אפשר לעצור בכל צעד בלי נזק.
**שני מצבים:** (א) מצב ביניים, שלבים 1-7: האתר החדש עונה בתת-דומיין זמני `aws.chasamsofer.co.il`, והדומיין הראשי, המייל והאתר ב-Railway לא משתנים. (ב) מעבר סופי, שלב 8, רק כשהכול מוכן.
סימון: **[אתה]** פעולה שלך בקונסולה או ב-GitHub. **[אוטומטי]** מתבצע בסקריפט.

## עלות חודשית (פרנקפורט, הערכה לפי מחירון 2026)
**בערך 65-72$ בחודש.** הכול באמזון: שרת Fargate אחד קטן, מאזן עומסים (ALB) בשני אזורי זמינות, WAF ו-Route 53.

| רכיב | עלות |
|---|---|
| שרת Fargate אחד, חצי ליבה 1GB | 21$ |
| מאזן עומסים (ALB) | 25$ |
| כתובות IPv4 ציבוריות (שתיים למאזן, אחת לשרת) | 11$ |
| WAF (חוקים מנוהלים והגבלת קצב) | 8$ |
| Route 53 (אזור אחד, רק במעבר סופי) | 0.5$ |
| תעודת HTTPS (ACM) | 0 |
| GuardDuty, CloudTrail, לוגים, ECR, סוד | 5-8$ |
| **סה"כ** | **בערך 65-72$** |

- בשרת ליבה ו-2GB (`CPU=1024 MEMORY=2048`) מוסיפים בערך 20$.
- תעבורה יוצאת עד 100GB בחודש לא עולה כסף.
- התקציב בשלב 2 מוגדר ל-80$ כדי להשאיר מרווח.

## איך זה עובד
- כל התעבורה נכנסת דרך מאזן העומסים. ה-WAF מסנן לפניו: חוקים מנוהלים של אמזון, חסימת כתובות עם מוניטין רע, והגבלת קצב לכתובת שמציפה בבקשות.
- ה-security group של השרת מאשר פורט 3000 **רק מה-security group של המאזן**. אי אפשר להגיע לשרת ישירות מהאינטרנט.
- HTTPS בלבד: פורט 80 מפנה ל-443. התעודה מאמזון (ACM) ומתחדשת אוטומטית.
- במצב ביניים ה-DNS נשאר אצל domainthenet.com, בלי אזור Route 53. במעבר הסופי הדומיין מנוהל ב-Route 53, והרשם נשאר domainthenet.com ורק שרתי השמות מוחלפים (שלב 8).
- משתני הסביבה יושבים ב-Secrets Manager, ולא כמשתני סביבה גלויים.

## שלב 1: חשבון ו-root [אתה]
פותחים חשבון, מפעילים אימות דו-שלבי ל-root, יוצרים משתמש יומיומי ונכנסים איתו. בדיוק לפי `aws/ACCOUNT-SETUP.md`, שלבים 1 ו-2.

## שלב 2: מעטפת תקציב ואבטחה (פעם אחת לכל החשבון) [אתה]
ב-CloudShell באזור Frankfurt:
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/account-setup.sh -o account-setup.sh
ALERT_EMAIL=המייל-שלך@example.com BUDGET=80 bash account-setup.sh
```
מאשרים במייל את "Subscription Confirmation". לא מריצים שוב לפרויקטים נוספים.

## שלב 3: הקמת התשתית של חתם סופר [אתה, פקודה אחת]
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/cloudshell-setup.sh -o cloudshell-setup.sh
bash cloudshell-setup.sh
```
- הסקריפט מבקש תעודת HTTPS ל-`aws.chasamsofer.co.il` בלבד ומדפיס **רשומת CNAME לאימות** (שם וערך). מוסיפים אותה ב-domainthenet.com בניהול ה-DNS של `chasamsofer.co.il`, והסקריפט ממשיך לבד כשהתעודה מאומתת (עד 30 דקות). אם הוא נעצר לפני כן, מריצים שוב את אותה פקודה.
- בסיום הוא מדפיס **רשומת CNAME שנייה**: השם `aws.chasamsofer.co.il` מצביע לכתובת המאזן (`AlbDnsName`). מוסיפים גם אותה אצל הרשם. שתי הרשומות לא משנות את הדומיין הראשי, את האתר ב-Railway ואת המייל.
- נוצר סטאק `chasamsofer` עם תגית `Project=chasamsofer`: ECR, ECS, ALB (שני אזורים), WAF, לוגים (30 יום), סוד, והרשאת פריסה מ-GitHub בלי מפתחות.
- `DesiredCount=0`: עדיין אין שרת, כי אין תמונה.
- ברירת המחדל: חצי ליבה, 1GB. להגדלה: `CPU=1024 MEMORY=2048 bash cloudshell-setup.sh`, ואת אותם ערכים מוסיפים בכל הרצה חוזרת (שלב 7).
- בסוף מודפסים `DeployRoleArn` ו-`AlbDnsName`. שומרים אותם. (`NameServers` מופיע רק במעבר הסופי.)

## שלב 4: משתני הסביבה בסוד [אתה]
Secrets Manager (Frankfurt) > `chasamsofer/prod` > Retrieve secret value > Edit.
- ממלאים את הערכים שקיימים היום ב-Railway (Variables של שירות chasamsofer). **לא מוחקים מפתחות** מה-JSON, גם ריקים: בלי מפתח ECS נכשל.
- אל תשלח אותם בצ'אט. מעתיקים ישירות מ-Railway לקונסולה.
- `NEDARIM_PROXY_URL`: משאירים כפי שהוא ב-Railway כל עוד `nedarim-proxy` שם.

## שלב 5: חיבור GitHub לפריסה אוטומטית [אתה]
1. מעבירים את `aws/deploy-aws.yml` ל-`.github/workflows/deploy-aws.yml` (אין לסוכנים הרשאה לכתוב לשם; לא פועל עד ש-`AWS_DEPLOY_ENABLED=true`). את הסוד ממלאים בפקודה אחת: `bash <(curl -fsSL "https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/fill-secret.sh?$(date +%s)")` ומדביקים את ה-Raw Editor של Railway.
2. Settings > Secrets and variables > Actions:
   - **Secret** `AWS_DEPLOY_ROLE_ARN` = הערך `DeployRoleArn` משלב 3.
   - **Variables:**

     | שם | ערך |
     |---|---|
     | `AWS_DEPLOY_ENABLED` | `true` |
     | `AWS_REGION` | `eu-central-1` |
     | `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_TASK_FAMILY` | `chasamsofer` (כולם) |
     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | אותם ערכים כמו ב-Railway |
     | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | `https://aws.chasamsofer.co.il` בזמן הביניים. במעבר הסופי משנים ל-`https://chasamsofer.co.il` ומריצים פריסה מחדש |

   **חשוב:** ערכי `NEXT_PUBLIC_*` נצרבים בתוך התמונה בזמן הבנייה, ולכן בהחלפה לדומיין הסופי חובה להריץ פריסה מחדש (שלב 8 ו).

## שלב 6: העלאת התמונה הראשונה [אתה]
GitHub > Actions > "פריסה ל-AWS" > Run workflow (ענף main). הפריסה בונה, מעלה ל-ECR ורושמת הגדרת משימה. בשלב הזה ייתכן שהשלב האחרון (המתנה ליציבות) יסתיים מיד כי `DesiredCount=0`, וזה תקין.

## שלב 7: הרמת שרת אחד [אתה, פקודה אחת]
```bash
DESIRED=1 bash cloudshell-setup.sh
```
- **שרת אחד בלבד, תמיד.** `instrumentation.ts` מריץ תזמונים פנימיים (גיבוי, פריקה, סנכרונים), ושתי משימות היו מריצות אותם פעמיים. אל תעלה את `DesiredCount` מעל 1.
- בודקים לפני המעבר, בלי להחליף DNS (הפקודה מודפסת בסוף הסקריפט): `curl -sk -H 'Host: aws.chasamsofer.co.il' https://<AlbDnsName>/api/health` (מצופה 200). אחרי שהוספת את ה-CNAME השני, האתר נפתח ישירות בדפדפן ב-`https://aws.chasamsofer.co.il`.
- **כתובות שנעולות על הדומיין הראשי** (יעבדו רק אחרי המעבר הסופי): `GMAIL_REDIRECT_URI` בסוד ובגוגל קלאוד, כתובות callback של Yemot, Resend (webhook) ו-Gmail PubSub. בזמן הביניים הן ממשיכות להצביע ל-Railway, וזה בכוונה: הן לא משתנות עד המעבר. התחברות Gmail ובדיקות webhook באתר הזמני לא ייבדקו מלא עד אז.
- הקוד עצמו לא נעול: הוא קורא `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` ויש רק ברירות מחדל ל-`https://chasamsofer.co.il` (למשל `Distributors.tsx`, `PhoneSystemClient.tsx`, `lineage-review/renew`, `yemot-book-fair/setup`, `scripts/trigger-*.mjs`).
- בזמן הבדיקה שני השרתים (Railway ו-AWS) מריצים תזמונים. כדי לא להכפיל גיבויים ושליחות, לפני בדיקה ארוכה מפעילים באחד מהם את משתני ה-`*_DISABLED` מהרשימה בסוד (למשל `DAILY_BACKUP_DISABLED=true` ב-AWS) ומסירים אותם ביום המעבר.

## שלב 8: מעבר סופי של הדומיין הראשי ל-Route 53 [אתה, רק אחרי שהכול נבדק]
האתר ממשיך לעבוד מ-Railway עד שמחליפים שרתי שמות (שלב ד). קודם מריצים ב-CloudShell את הפקודה למעבר סופי, שמנפיקה תעודה לדומיין המלא ויוצרת את אזור Route 53 (אותה פקודת הקמה עם שני ערכים נוספים; חובה לצרף גם `DESIRED=1` וכל ערך אחר שהשתמשת בו):
```bash
DOMAIN=chasamsofer.co.il CREATE_ZONE=true DESIRED=1 bash cloudshell-setup.sh
```
הסקריפט ידפיס רשומת אימות חדשה לתעודה של הדומיין המלא. אחרי שהאזור נוצר, ממשיכים:

**א. מעתיקים את כל הרשומות הקיימות לאזור ב-Route 53.** זה השלב החשוב ביותר: אחרת מייל ושירותים יפסיקו לעבוד.
1. ב-domainthenet.com פותחים את ניהול ה-DNS של `chasamsofer.co.il` ומעתיקים את הרשימה המלאה (במיוחד MX, TXT, CNAME של מייל ושל Resend, ורשומות `in`).
2. ב-AWS: Route 53 > Hosted zones > `chasamsofer.co.il` > Create record. מוסיפים כל רשומה שאינה הרשומה של האתר עצמו (A ו-AAAA של `chasamsofer.co.il` כבר קיימות, ומצביעות למאזן). אם יש `www`, מוסיפים אותה כהפניה לפי מה שקיים היום.
3. בודקים ששום רשומה לא חסרה: משווים רשומה מול רשומה.

**ב. מורידים TTL.** יום לפני, ב-domainthenet.com מורידים TTL של הרשומות ל-300 שניות.

**ג. משתנים ו-Webhooks.** מעדכנים ב-Secrets Manager את `GMAIL_REDIRECT_URI` (ובהתאם ב-Google Cloud), ובודקים שכתובות Yemot, Resend ו-Gmail PubSub מצביעות לדומיין.

**ד. החלפת שרתי השמות, צעד אחרי צעד:**
1. ב-AWS: Route 53 > Hosted zones > `chasamsofer.co.il`. מעתיקים את ארבעת הערכים בשורת ה-NS (או מהפלט `NameServers` של הסקריפט). הם נראים כמו `ns-123.awsdns-45.com`.
2. נכנסים ל-domainthenet.com, לניהול הדומיין `chasamsofer.co.il`, ובוחרים "שרתי שמות" (Name Servers / DNS).
3. מוחקים את השרתים הקיימים ומדביקים את ארבעת השרתים של אמזון (בלי נקודה בסוף אם הממשק לא מקבל).
4. שומרים. ההחלפה אצל סיומת `.co.il` יכולה לקחת מכמה דקות עד 24 שעות.
5. בודקים: `https://chasamsofer.co.il/api/health` מחזיר 200, ושולחים מייל בדיקה פנימה ובחוץ.
6. **לחזרה מהירה ל-Railway** (אם משהו נשבר): מחזירים בשלב 3 את שרתי השמות הקודמים. לכן רושמים אותם לפני ההחלפה.

**ו. כתובות האתר באפליקציה:** משנים ב-GitHub את `NEXT_PUBLIC_SITE_URL` ו-`NEXT_PUBLIC_APP_URL` ל-`https://chasamsofer.co.il` ומריצים פריסה מחדש. מסירים את הרשומה `aws` אצל הרשם אחרי שהמעבר הושלם (אופציונלי).

**ה. תזמון חיצוני:** `/api/cron/name-reminders` רץ היום כשירות נפרד ב-Railway (`cron-name-reminders`). צריך להעביר את הלוח שלו כדי להקים EventBridge Scheduler. עד אז לא מכבים אותו.

הרשם עצמו (domainthenet.com) נשאר: אמזון לא משמשת כרשם של `.co.il`, ורק ה-DNS עובר.

## שלב 9: סיום
- Railway נשאר כגיבוי כמה ימים, ואז מכבים את השירותים.
- ב-Cost Explorer (Group by Tag `Project`) רואים את עלות חתם סופר בנפרד, מ-24 שעות אחרי ההקמה.

## פרויקט נוסף בעתיד
אותו חשבון ואותה מעטפת. לכל פרויקט:
```bash
PROJECT=myapp REPO=shlomo1315/myapp DOMAIN=myapp.co.il bash cloudshell-setup.sh
```
נוצר סטאק נפרד עם תגית `Project=myapp` והרשאת פריסה שמוגבלת לריפו שלו בלבד. את `deploy-aws.yml` מעתיקים לריפו החדש עם ערכים משלו. ה-provider של GitHub הוא אחד לחשבון, והסקריפט מזהה אותו ולא יוצר שוב.
