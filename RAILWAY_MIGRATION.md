# העברת המערכת ל-Railway — מדריך מלא

מדריך זה מתאר כיצד להריץ את מערכת "היכל החתם סופר" (Next.js + Supabase + Gmail)
על Railway. הקוד כבר הוכן ומוכן לפריסה (`railway.json`, `.nvmrc`, התאמת `start`).

> **שלב נוכחי:** העלאה לדומיין זמני של Railway לבדיקה, לפני העברת הדומיין הקבוע.
> במהלך הבדיקה האתר ב-Vercel (chasamsofer.co.il) ממשיך לעבוד כרגיל — אין סיכון.

---

## שלב 1 — יצירת הפרויקט ב-Railway
1. היכנס ל-https://railway.app והתחבר עם GitHub.
2. **New Project → Deploy from GitHub repo → `shlomo1315/chatamsofer`**.
3. בחר את ענף `main`. Railway יזהה אוטומטית שזה Next.js (Nixpacks) וישתמש
   בהגדרות שב-`railway.json` (build: `npm run build`, start: `npm run start`).

## שלב 2 — הזנת משתני הסביבה
ב-Railway: **Project → Variables → Raw Editor**, והדבק את כל המשתנים מתוך הקובץ
`.env.example` (שבריפו), עם הערכים האמיתיים. רשימת המשתנים הנדרשים:

| משתנה | מאיפה לוקחים |
|--------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Google Cloud Console → Credentials |
| `GMAIL_EMAIL`, `MAIL_DOMAIN` | כתובת המשרד (office@chasamsofer.info) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | ספק ה-SMTP |
| `NEDARIM_MOSAD_ID`, `NEDARIM_API_PASSWORD` | נדרים קארד |
| `CRON_SECRET`, `OTP_NONCE_SECRET` | מחרוזות אקראיות ארוכות (אפשר ליצור ב-`openssl rand -hex 32`) |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | בשלב הזמני: כתובת ה-Railway המלאה (ראה שלב 3) |

> את הערכים אפשר להעתיק 1:1 מ-Vercel → Project → Settings → Environment Variables.

## שלב 3 — דומיין זמני
ב-Railway: **Service → Settings → Networking → Generate Domain**.
תקבל כתובת כמו `https://chatamsofer-production.up.railway.app`.
חזור לשלב 2 והגדר ל-`NEXT_PUBLIC_SITE_URL` ו-`NEXT_PUBLIC_APP_URL` את הכתובת הזו.

## שלב 4 — פריסה ראשונה ובדיקה
Railway יפרוס אוטומטית. בסיום (Deploy → Success) פתח את הדומיין הזמני וודא:
- הטופס הציבורי נטען ועובד (רישום → פופאפ הצלחה).
- כניסת ניהול (`/admin`) עובדת.

## שלב 5 — Gmail OAuth לדומיין הזמני
כדי שתיבת המייל תעבוד תחת הדומיין הזמני:
1. Google Cloud Console → APIs & Services → Credentials → OAuth Client.
2. תחת **Authorized redirect URIs** הוסף:
   `https://<הדומיין-הזמני>/api/auth/gmail/callback`
3. עדכן את `GMAIL_REDIRECT_URI` ב-Railway לאותה כתובת בדיוק.
4. היכנס ל-`/admin/mail` ולחץ "חבר Gmail" כדי לאשר מחדש.

## שלב 6 — משימות מתוזמנות (Cron)
ב-Railway אין `vercel.json`. שתי המשימות נחשפות כ-endpoints מאומתים
(`?secret=<CRON_SECRET>`). הדרך הפשוטה והאמינה: שירות cron חיצוני חינמי
(למשל https://cron-job.org):

| משימה | כתובת | תדירות מומלצת |
|--------|--------|----------------|
| מענה אוטומטי | `https://<דומיין>/api/cron/auto-reply?secret=<CRON_SECRET>` | כל 15 דקות |
| פריקת כרטיסים שפג תוקפם | `https://<דומיין>/api/nedarim/unload-expired?secret=<CRON_SECRET>` | פעם ביום (למשל 02:00) |

> יתרון: ב-Railway אין מגבלת התדירות של Vercel Hobby — אפשר להחזיר את המענה
> האוטומטי ל-15 דקות.
>
> **חלופה ללא שירות חיצוני:** ליצור ב-Railway "Cron Service" נוסף שמריץ
> `curl` לכתובות הנ"ל לפי הלו"ז.

## שלב 7 — צ'קליסט בדיקה
- [ ] טופס רישום ציבורי + פופאפ הצלחה
- [ ] בורר מצב משפחתי (נשואים/אחר)
- [ ] כניסת ניהול + רשימת צאצאים
- [ ] מסך אישור יולדת — כרטסת מלאה, עץ דורות, לשונית תכתובות מייל
- [ ] השלמת מסמכים — הצגת קבצים קיימים
- [ ] שליחת/קבלת מייל ב-`/admin/mail`
- [ ] cron מענה אוטומטי רץ (בדיקה ידנית של הכתובת עם ה-secret)

## שלב 8 — מעבר הדומיין הקבוע (בהמשך, רק אחרי שהבדיקה עברה)
1. Railway → Service → Settings → Networking → **Custom Domain** → `chasamsofer.co.il`.
   Railway ייתן רשומת CNAME/A.
2. אצל ספק ה-DNS של הדומיין: עדכן את הרשומה מ-Vercel ל-Railway (לפי ההנחיה).
3. עדכן ב-Railway את `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
   `GMAIL_REDIRECT_URI` לכתובת `https://chasamsofer.co.il/...`.
4. הוסף/החלף ב-Google Cloud את redirect ה-OAuth לדומיין הקבוע.
5. לאחר אימות שהכל עובד — אפשר לכבות את פרויקט ה-Vercel.

---

### הערות
- `vercel.json` ו-`.github/workflows/vercel-production.yml` נשארים בריפו בשלב הזה
  כדי ש-Vercel ימשיך לעבוד במקביל לבדיקה. נסיר אותם רק אחרי מעבר מלא.
- אין צורך ב-Dockerfile — Railway בונה אוטומטית עם Nixpacks לפי `railway.json`.
