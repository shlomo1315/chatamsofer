# מעטפת לחשבון AWS: תקציב, אבטחה וסדר

חשבון AWS אחד לכל הפרויקטים. כל פרויקט הוא סטאק משלו, עם תגית `Project`. על החשבון כולו יש תקציב, התראות ושמירה.

## שלב 1: חשבון ו-root (פעם אחת, ידני, כ-15 דקות)
1. נרשמים ב-https://aws.amazon.com עם מייל ייעודי (לא מייל אישי שמשתמשים בו בכל מקום) וכרטיס אשראי.
2. **אימות דו-שלבי ל-root:** בפינה העליונה לוחצים על שם החשבון ואז Security credentials > Assign MFA device. מומלץ אפליקציית Authenticator או מפתח פיזי.
3. **לא יוצרים Access keys ל-root.** באותו מסך, אם מופיע מפתח, מוחקים אותו.
4. **גישה לחיוב למשתמשים:** שם החשבון > Account > "IAM user and role access to Billing information" > Edit > Activate. בלי זה המשתמש היומיומי לא יראה את החשבונית.
5. **אנשי קשר:** באותו מסך ממלאים Alternate contacts (Billing ו-Security) עם המייל שלך, כדי ש-AWS יוכלו להתריע.

## שלב 2: משתמש יומיומי (במקום root)
1. IAM > Users > Create user, שם למשל `shlomo-admin`, עם "Provide user access to the AWS Management Console".
2. Permissions: Attach policies directly > `AdministratorAccess`.
3. מתחברים עם המשתמש החדש ומוסיפים לו MFA (Security credentials > Assign MFA device).
4. מעכשיו עובדים רק עם המשתמש הזה. ל-root נכנסים רק לחיוב או לסגירת החשבון.

## שלב 3: המעטפת (פקודה אחת ב-CloudShell)
מתחברים עם המשתמש היומיומי, בוחרים אזור Frankfurt (eu-central-1), פותחים CloudShell (האייקון `>_` למעלה) ומדביקים:

```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/account-setup.sh -o account-setup.sh
ALERT_EMAIL=המייל-שלך@example.com BUDGET=60 bash account-setup.sh
```

- `BUDGET` הוא התקציב החודשי בדולרים. ההערכה לחתם סופר היא שרת Fargate אחד, ALB, WAF, לוגים ו-ECR, בסביבות 45-60$ בחודש.
- `ANOMALY` (רשות, ברירת מחדל 10) הוא הסכום המינימלי שבו חריגה לא רגילה שולחת מייל.
- הסקריפט בטוח להרצה חוזרת, למשל לשינוי התקציב: `ALERT_EMAIL=... BUDGET=100 bash account-setup.sh`.
- **אחרי ההרצה:** מאשרים במייל את ההודעה "AWS Notification - Subscription Confirmation". בלי האישור התראות האבטחה לא יגיעו.

### מה הסקריפט מקים
| מה | למה | עלות |
|---|---|---|
| תקציב חודשי (`account-costs`, us-east-1) | מייל ב-50%, 80% ו-100%, ומייל כשהתחזית צופה חריגה עוד לפני שהיא קורית | חינם |
| זיהוי חריגות עלות (Cost Anomaly Detection) | מייל יומי על קפיצה לא רגילה בשירות כלשהו (למשל שרת שנשכח או כרייה) | חינם |
| CloudTrail (`account-security`) | יומן של כל פעולה בחשבון בכל האזורים, נשמר שנה ב-S3 מוצפן וחסום | כמעט חינם |
| GuardDuty | מזהה מפתחות שנגנבו, כריית מטבעות וגישה חשודה, ושולח מייל בחומרה בינונית ומעלה | 30 יום חינם, ואחר כך כ-1-5$ בחודש |
| IAM Access Analyzer | מייל כשמשאב נפתח לגישה מחוץ לחשבון | חינם |
| הקשחות בסיס | מדיניות סיסמאות חזקה, חסימת S3 ציבורי בכל החשבון, הצפנת דיסקים כברירת מחדל | חינם |

## שלב 4: פרויקטים
- כל פרויקט הוא סטאק משלו עם התבנית `aws/infrastructure.yml` (ראו `AWS_MIGRATION.md`). `cloudshell-setup.sh` מסמן אותו אוטומטית בתגית `Project=<שם הסטאק>`.
- **חיוב לפי פרויקט:** Billing > Cost Explorer > Group by: Tag > `Project`. התגית מופיעה בדוח רק 24 שעות אחרי שהיא נוצרת. אם הסקריפט כתב "עוד לא זמינה", מריצים אותו שוב למחרת.
- הגנות עלות שכבר בתוך תבנית הפרויקט: לוגים נשמרים 30 יום, ב-ECR נשמרות רק 10 התמונות האחרונות (תמונות בלי תגית נמחקות אחרי יום), ושרת אחד בלבד (`DesiredCount=1`).

## כשמגיע מייל התראה
- **תקציב או חריגה:** Billing > Bills, ובודקים איזה שירות קפץ. שירות שלא מוכר לך, באזור שלא עובדים בו, הוא סימן לפריצה.
- **GuardDuty:** GuardDuty > Findings. אם מדובר במפתח שנחשף, מבטלים אותו מיד ב-IAM ומחליפים סיסמה.
- **מה שאסור:** לשמור מפתחות AWS בקוד, בצ'אט או בקבצים. הפריסה מ-GitHub עובדת דרך OIDC בלי מפתחות.
