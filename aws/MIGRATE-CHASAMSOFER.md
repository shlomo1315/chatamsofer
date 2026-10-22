# מעבר חתם סופר מ-Railway ל-AWS: צעד אחרי צעד

Railway ממשיך לשרת את האתר עד שלב 9. עד אז אפשר לעצור בכל צעד בלי נזק.
סימון: **[אתה]** פעולה שלך בקונסולה או ב-GitHub. **[אוטומטי]** מתבצע בסקריפט.

## שלב 1: חשבון ו-root [אתה]
פותחים חשבון, מפעילים אימות דו-שלבי ל-root, יוצרים משתמש יומיומי ונכנסים איתו. בדיוק לפי `aws/ACCOUNT-SETUP.md`, שלבים 1 ו-2.

## שלב 2: מעטפת תקציב ואבטחה (פעם אחת לכל החשבון) [אתה]
ב-CloudShell באזור Frankfurt:
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/account-setup.sh -o account-setup.sh
ALERT_EMAIL=המייל-שלך@example.com BUDGET=60 bash account-setup.sh
```
מאשרים במייל את "Subscription Confirmation". לא מריצים שוב לפרויקטים נוספים.

## שלב 3: הקמת התשתית של חתם סופר [אתה, פקודה אחת]
```bash
curl -fsSL https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/cloudshell-setup.sh -o cloudshell-setup.sh
bash cloudshell-setup.sh
```
- נוצר סטאק `chasamsofer` עם תגית `Project=chasamsofer`: ECR, ECS, ALB, WAF, לוגים (30 יום), סוד, והרשאת פריסה מ-GitHub בלי מפתחות.
- `DesiredCount=0`: עדיין אין שרת, כי אין תמונה.
- בסוף מודפסים `AlbDnsName` ו-`DeployRoleArn`. שומרים אותם.

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
     | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | בשלב הבדיקה: `http://<AlbDnsName>` |

   **חשוב:** ערכי `NEXT_PUBLIC_*` נצרבים בתוך התמונה בזמן הבנייה. כשעוברים לדומיין (שלב 8) מחליפים אותם ל-`https://chasamsofer.co.il` ומריצים פריסה מחדש.

## שלב 6: העלאת התמונה הראשונה [אתה]
GitHub > Actions > "פריסה ל-AWS" > Run workflow (ענף main). הפריסה בונה, מעלה ל-ECR ורושמת הגדרת משימה. בשלב הזה ייתכן שהשלב האחרון (המתנה ליציבות) יסתיים מיד כי `DesiredCount=0`, וזה תקין.

## שלב 7: הרמת שרת אחד [אתה, פקודה אחת]
```bash
DESIRED=1 bash cloudshell-setup.sh
```
- **שרת אחד בלבד, תמיד.** `instrumentation.ts` מריץ תזמונים פנימיים (גיבוי, פריקה, סנכרונים), ושתי משימות היו מריצות אותם פעמיים. אל תעלה את `DesiredCount` מעל 1.
- בודקים בדפדפן `http://<AlbDnsName>/api/health` (מצופה 200) ואז את האתר, התחברות ופעולה אחת בכל מסך מרכזי.
- בזמן הבדיקה שני השרתים (Railway ו-AWS) מריצים תזמונים. כדי לא להכפיל גיבויים ושליחות, לפני בדיקה ארוכה מפעילים באחד מהם את משתני ה-`*_DISABLED` מהרשימה בסוד (למשל `DAILY_BACKUP_DISABLED=true` ב-AWS) ומסירים אותם ביום המעבר.

## שלב 8: תעודה, דומיין ומעבר [אתה]
1. **תעודה:** Certificate Manager (Frankfurt) > Request > `chasamsofer.co.il`, אימות DNS. ב-domainthenet.com מוסיפים את רשומת ה-CNAME שמוצגת. מחכים ל-Issued ומעתיקים את ה-ARN.
2. **HTTPS:** `CERT=<ה-ARN> DESIRED=1 bash cloudshell-setup.sh` (עדכון של אותו סטאק).
3. **משתנים:** מחליפים ב-GitHub את `NEXT_PUBLIC_SITE_URL` ו-`NEXT_PUBLIC_APP_URL` ל-`https://chasamsofer.co.il`, ובסוד את `GMAIL_REDIRECT_URI` (ובהתאם ב-Google Cloud). מריצים פריסה מחדש.
4. **DNS:** יום קודם מורידים TTL ל-300 שניות. ב-domainthenet.com משנים את רשומת האתר ל-CNAME אל `AlbDnsName`. (לדומיין ראשי בלי `www` ייתכן שהספק לא מאפשר CNAME. אז מפנים `www` ומגדירים הפניה מהראשי, או שאומר לי ונכין פתרון.)
5. **Webhooks:** בודקים שכתובות Yemot, Resend ו-Gmail PubSub מצביעות לדומיין.
6. **תזמון חיצוני:** `/api/cron/name-reminders` רץ היום כשירות נפרד ב-Railway (`cron-name-reminders`). צריך להעביר לי את הלוח שלו כדי להקים EventBridge Scheduler. עד אז לא מכבים אותו.

## שלב 9: סיום
- Railway נשאר כגיבוי כמה ימים, ואז מכבים את השירותים.
- ב-Cost Explorer (Group by Tag `Project`) רואים את עלות חתם סופר בנפרד, מ-24 שעות אחרי ההקמה.

## פרויקט נוסף בעתיד
אותו חשבון ואותה מעטפת. לכל פרויקט:
```bash
PROJECT=myapp REPO=shlomo1315/myapp DOMAIN=myapp.co.il bash cloudshell-setup.sh
```
נוצר סטאק נפרד עם תגית `Project=myapp` והרשאת פריסה שמוגבלת לריפו שלו בלבד. את `deploy-aws.yml` מעתיקים לריפו החדש עם ערכים משלו. ה-provider של GitHub הוא אחד לחשבון, והסקריפט מזהה אותו ולא יוצר שוב.
