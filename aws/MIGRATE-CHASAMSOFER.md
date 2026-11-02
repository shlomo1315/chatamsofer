# מעבר חתם סופר מ-Railway ל-AWS: צעד אחרי צעד

Railway ממשיך לשרת את האתר עד שלב 9. עד אז אפשר לעצור בכל צעד בלי נזק.
סימון: **[אתה]** פעולה שלך בקונסולה או ב-GitHub. **[אוטומטי]** מתבצע בסקריפט.

## עלות חודשית (פרנקפורט, הערכה לפי מחירון 2026)
**בערך 65-72$ בחודש.** הכול באמזון: שרת Fargate אחד קטן, מאזן עומסים (ALB) בשני אזורי זמינות, WAF ו-Route 53.

| רכיב | עלות |
|---|---|
| שרת Fargate אחד, חצי ליבה 1GB | 21$ |
| מאזן עומסים (ALB) | 25$ |
| כתובות IPv4 ציבוריות (שתיים למאזן, אחת לשרת) | 11$ |
| WAF (חוקים מנוהלים והגבלת קצב) | 8$ |
| Route 53 (אזור אחד) | 0.5$ |
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
- הדומיין מנוהל ב-Route 53. הרשם נשאר domainthenet.com, ורק שרתי השמות מוחלפים (שלב 8).
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
- הסקריפט מבקש תעודת HTTPS ל-`chasamsofer.co.il` ומדפיס **רשומת CNAME אחת** (שם וערך). מוסיפים אותה ב-domainthenet.com בניהול ה-DNS של הדומיין, והסקריפט ממשיך לבד כשהתעודה מאומתת (עד 30 דקות). הרשומה לא משנה את האתר החי. אם הוא נעצר לפני כן, מריצים שוב את אותה פקודה.
- נוצר סטאק `chasamsofer` עם תגית `Project=chasamsofer`: ECR, ECS, ALB (שני אזורים), WAF, Route 53, לוגים (30 יום), סוד, והרשאת פריסה מ-GitHub בלי מפתחות.
- `DesiredCount=0`: עדיין אין שרת, כי אין תמונה.
- ברירת המחדל: חצי ליבה, 1GB. להגדלה: `CPU=1024 MEMORY=2048 bash cloudshell-setup.sh`, ואת אותם ערכים מוסיפים בכל הרצה חוזרת (שלב 7).
- בסוף מודפסים `DeployRoleArn` ו-`NameServers`. שומרים אותם.

## שלב 4: משתני הסביבה בסוד [אתה]
Secrets Manager (Frankfurt) > `chasamsofer/prod` > Retrieve secret value > Edit.
- ממלאים את הערכים שקיימים היום ב-Railway (Variables של שירות chasamsofer). **לא מוחקים מפתחות** מה-JSON, גם ריקים: בלי מפתח ECS נכשל.
- אל תשלח אותם בצ'אט. מעתיקים ישירות מ-Railway לקונסולה.
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
     | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | `https://chasamsofer.co.il` |

   **חשוב:** ערכי `NEXT_PUBLIC_*` נצרבים בתוך התמונה בזמן הבנייה. הם כבר מצביעים לדומיין הסופי, ולכן אין צורך להחליף אותם במעבר.

## שלב 6: העלאת התמונה הראשונה [אתה]
GitHub > Actions > "פריסה ל-AWS" > Run workflow (ענף main). הפריסה בונה, מעלה ל-ECR ורושמת הגדרת משימה. בשלב הזה ייתכן שהשלב האחרון (המתנה ליציבות) יסתיים מיד כי `DesiredCount=0`, וזה תקין.

## שלב 7: הרמת שרת אחד [אתה, פקודה אחת]
```bash
DESIRED=1 bash cloudshell-setup.sh
```
- **שרת אחד בלבד, תמיד.** `instrumentation.ts` מריץ תזמונים פנימיים (גיבוי, פריקה, סנכרונים), ושתי משימות היו מריצות אותם פעמיים. אל תעלה את `DesiredCount` מעל 1.
- בודקים לפני המעבר, בלי להחליף DNS (הפקודה מודפסת בסוף הסקריפט): `curl -sk -H 'Host: chasamsofer.co.il' https://<AlbDnsName>/api/health` (מצופה 200). אחר כך אפשר לבדוק את האתר בדפדפן דרך קובץ hosts מקומי שמפנה את הדומיין לכתובת של המאזן.
- בזמן הבדיקה שני השרתים (Railway ו-AWS) מריצים תזמונים. כדי לא להכפיל גיבויים ושליחות, לפני בדיקה ארוכה מפעילים באחד מהם את משתני ה-`*_DISABLED` מהרשימה בסוד (למשל `DAILY_BACKUP_DISABLED=true` ב-AWS) ומסירים אותם ביום המעבר.

## שלב 8: העברת הדומיין ל-Route 53 [אתה, רק אחרי שהכול נבדק]
האתר ממשיך לעבוד מ-Railway עד שמחליפים שרתי שמות (שלב ד). לפני כן:

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
