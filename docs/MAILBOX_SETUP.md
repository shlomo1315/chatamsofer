# הקמת תיבת הדואר (Mailbox) עם Gmail / Google Workspace

מדריך מלא לחיבור תיבת ה-Google Workspace שלך (`office@chasamsofer.info`) למערכת,
לשליחה **וקבלה** של מיילים אמיתיים מתוך מסך "תיבת דואר".

> **למה Gmail ולא Resend / DNS:** מכיוון שכבר יש לך Google Workspace, אנחנו מתחברים
> ישירות לתיבה הקיימת. **אין שום שינוי ב-DNS** — ה-MX של Google נשאר כמו שהוא, והמיילים
> מסונכרנים עם Gmail עצמו. החיבור הוא דרך OAuth (אישור חד-פעמי), ללא סיסמאות.

---

## מה צריך
1. גישת **מנהל (admin)** ל-Google Workspace של `chasamsofer.info` (מומלץ — לאישור OAuth פנימי).
2. גישה ל-[Google Cloud Console](https://console.cloud.google.com).
3. גישה ל-Vercel (משתני סביבה) ול-Supabase (הרצת מיגרציה).
4. **כתובת האפליקציה** — ה-URL שבו רץ האתר (למשל `https://chatamsofer.vercel.app` או דומיין משלך). נסמן אותה כאן `APP_URL`.

---

## שלב 1 — פרויקט ב-Google Cloud + הפעלת Gmail API
1. [Google Cloud Console](https://console.cloud.google.com) ‹ צור פרויקט חדש (או בחר קיים).
2. **APIs & Services** ‹ **Enable APIs and Services** ‹ חפש **Gmail API** ‹ **Enable**.

---

## שלב 2 — מסך הסכמה (OAuth consent screen)
1. **APIs & Services** ‹ **OAuth consent screen**.
2. **User type:** בחר **Internal** (אפשרי כי זה Workspace — מונע צורך באימות אפליקציה של Google). אם Internal חסום, בחר External והוסף את `office@chasamsofer.info` כ-Test user.
3. מלא שם אפליקציה ("היכל החתם סופר") ואימייל תמיכה ‹ שמור.
4. **Scopes** — אין חובה להוסיף ידנית; המערכת מבקשת את ההרשאות בזמן החיבור.

---

## שלב 3 — יצירת OAuth Client
1. **APIs & Services** ‹ **Credentials** ‹ **Create Credentials** ‹ **OAuth client ID**.
2. **Application type:** **Web application**.
3. תחת **Authorized redirect URIs** ‹ **Add URI** והדבק בדיוק:
   ```
   APP_URL/api/admin/mailbox/google/callback
   ```
   (לדוגמה: `https://chatamsofer.vercel.app/api/admin/mailbox/google/callback`. אם יש כמה כתובות לאתר — הוסף שורה לכל אחת.)
4. צור ‹ העתק את **Client ID** ואת **Client Secret**.

---

## שלב 4 — משתני סביבה ב-Vercel
Vercel ‹ הפרויקט ‹ **Settings** ‹ **Environment Variables** (Production + Preview):

| משתנה | ערך |
|-------|-----|
| `GOOGLE_CLIENT_ID` | ה-Client ID (מסתיים ב-`.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | ה-Client Secret (`GOCSPX-…`) |
| `MAILBOX_FROM_NAME` | `היכל החתם סופר` |
| `CRON_SECRET` | מחרוזת אקראית ארוכה (אם עוד לא קיים) — מאמת את סנכרון הדואר |

> ודא שכבר קיימים `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
> רשימה מלאה ב-`.env.example`.

לאחר ההוספה — **Redeploy** לפרויקט כדי שהמשתנים ייכנסו לתוקף.

---

## שלב 5 — מסד הנתונים
פתח Supabase ‹ **SQL Editor** והרץ (פעם אחת כל אחד, אם עוד לא):
- `supabase/migrations/20260604_mailbox.sql` — טבלאות תיבת הדואר + דלי אחסון.
- `supabase/migrations/20260605_mail_google.sql` — טבלת חיבור ה-Gmail (טוקנים).

---

## שלב 6 — חיבור החשבון (האישור החד-פעמי)
1. היכנס למערכת כמנהל ‹ **תיבת דואר**.
2. יופיע באנר כחול — לחץ **"התחבר ל-Gmail"**.
3. תועבר ל-Google ‹ בחר את `office@chasamsofer.info` ‹ **אשר** את הגישה.
4. תחזור למערכת עם הודעת הצלחה ירוקה, וה-כתובת המחוברת תוצג בראש המסך.

> חשוב: בחלון ההרשאה חייבים לאשר את **כל** ההרשאות המבוקשות (שליחה/קריאה), אחרת השליחה או הקבלה לא יעבדו.

---

## שלב 7 — קבלת מיילים (סנכרון)
- **ידני / מיידי:** כפתור הרענון 🔄 בתיבת הדואר מושך מיילים חדשים מ-Gmail ברגע הלחיצה.
- **אוטומטי ברקע:** הוגדר Cron כל 5 דקות (`vercel.json`).
  - ב-Vercel **Pro** — רץ כל 5 דקות (כמעט בזמן אמת).
  - ב-Vercel **Hobby** — Cron מוגבל לריצה יומית בלבד; הסנכרון האוטומטי יקרה פעם ביום, אבל **כפתור הרענון תמיד מסנכרן מיידית**. לשדרוג לזמן-אמת אפשר לעבור ל-Pro.

מייל חדש שנכנס מופיע אוטומטית במסך (עדכון בזמן אמת) ברגע שהסנכרון מייבא אותו.

---

## שלב 8 — בדיקה
**שליחה:** תיבת דואר ‹ **כתוב הודעה** ‹ שלח לעצמך. אמור להגיע מייל מ-`office@chasamsofer.info` (וגם להופיע בתיקיית "נשלח" וב-Gmail עצמו).

**קבלה:** השב לאותו מייל מתיבה חיצונית (Gmail אחר וכו') ‹ לחץ רענון 🔄 ‹ ההודעה תופיע ב"דואר נכנס" עם הגוף המלא והקבצים המצורפים.

---

## פתרון תקלות
- **הבאנר "התחבר ל-Gmail" לא נעלם אחרי חיבור** → ודא שאישרת את כל ההרשאות; נסה שוב. בדוק ש-`GOOGLE_CLIENT_ID/SECRET` הוגדרו ושעשית Redeploy.
- **"חיבור Gmail נכשל: redirect_uri_mismatch"** → ה-URI ב-Google Cloud (שלב 3) חייב להיות **זהה בדיוק** ל-`APP_URL/api/admin/mailbox/google/callback`, כולל https ובלי `/` עודף.
- **"Gmail אינו מחובר"** בשליחה → לא חובר חשבון, או שהטוקן נמחק. חבר מחדש דרך הבאנר.
- **מיילים נכנסים לא מופיעים** → לחץ רענון; ודא ש-`CRON_SECRET` מוגדר; בדוק שאישרת הרשאת קריאה.
- **שגיאה "invalid_grant" אחרי זמן** → חיבור מחדש דרך הבאנר (Refresh token עלול להתבטל אם שונתה הסיסמה או ההרשאות).
- **החיבור דורש אישור חוזר תכוף** → ודא שבחרת **Internal** במסך ההסכמה (External במצב Testing מגביל את תוקף ה-Refresh token ל-7 ימים).

> **קבצים מצורפים בדואר נכנס** מורדים אוטומטית מ-Gmail ונשמרים במערכת — ניתנים להורדה ישירה מההודעה.
