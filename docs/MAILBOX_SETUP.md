# הקמת תיבת הדואר (Mailbox) עם Resend — `chasamsofer.info`

מדריך מלא להפעלת שליחה **וקבלה** של מיילים אמיתיים במערכת.
כל הצעדים נעשים פעם אחת. בסוף — תוכל לשלוח ולקבל מיילים מתוך מסך "תיבת דואר".

> **שני דומיינים שונים — אל תתבלבל:**
> - **דומיין המייל:** `chasamsofer.info` — כאן מגדירים את רשומות ה-DNS ב-Resend.
> - **כתובת האפליקציה:** הכתובת שבה רץ האתר (ב-Vercel, למשל `chatamsofer.vercel.app` או דומיין משלך) — לשם מגיע ה-webhook של מייל נכנס.

---

## מה צריך
1. חשבון ב-[resend.com](https://resend.com) (יש שכבה חינמית).
2. גישה לניהול ה-DNS של `chasamsofer.info` (אצל רשם הדומיין / ספק ה-DNS).
3. גישה ל-Vercel (להגדרת משתני סביבה) ול-Supabase (להרצת המיגרציה).

---

## שלב 1 — הוספת הדומיין ל-Resend
1. היכנס ל-Resend ‹ **Domains** ‹ **Add Domain**.
2. הזן `chasamsofer.info` ובחר Region (מומלץ הקרוב גאוגרפית; זכור אותו — הוא משפיע על ערכי ה-MX).
3. Resend יציג לך טבלת רשומות DNS. **את הערכים המדויקים מעתיקים משם** — הם נוצרים פר-דומיין (במיוחד מפתח ה-DKIM).

---

## שלב 2 — רשומות DNS לשליחה (SPF + DKIM)
הוסף אצל ספק ה-DNS את הרשומות ש-Resend מציג. בדרך כלל הן נראות כך (העתק את הערכים **מהמסך של Resend**, לא מכאן):

| מטרה | Type | Host / Name | Value (לדוגמה) |
|------|------|-------------|----------------|
| SPF (Return-Path) | `MX`  | `send.chasamsofer.info`            | `feedback-smtp.<region>.amazonses.com` · priority **10** |
| SPF | `TXT` | `send.chasamsofer.info`            | `v=spf1 include:amazonses.com ~all` |
| DKIM | `TXT` | `resend._domainkey.chasamsofer.info` | `p=MIGfMA0GCSq...` (מפתח ארוך מ-Resend) |

> רשומת ה-MX הזו על תת-הדומיין `send.` היא ל-Return-Path בלבד — **היא לא משפיעה על הדואר הרגיל של הדומיין**.

אחרי ההוספה, ב-Resend לחץ **Verify DNS Records**. עד שמתפשט (לרוב דקות, עד 24 שעות) יופיע "pending". כשירוק — מוכן לשליחה.

### (מומלץ) DMARC
רשומה אחת שמשפרת מסירוּת ומונעת זיופים:

| Type | Host | Value |
|------|------|-------|
| `TXT` | `_dmarc.chasamsofer.info` | `v=DMARC1; p=none; rua=mailto:office@chasamsofer.info` |

---

## שלב 3 — רשומת DNS לקבלה (MX) ⚠️
כדי שתשובות יחזרו **לתוך המערכת**, צריך שהדואר הנכנס של `chasamsofer.info` ינותב ל-Resend. ב-Resend ‹ **Receiving** הפעל קבלה ל-`chasamsofer.info` והוסף את רשומת ה-MX שהוא מציג:

| Type | Host | Value | Priority |
|------|------|-------|----------|
| `MX` | `chasamsofer.info` (השורש) | *(הערך מוצג ב-Resend)* | **10** (חייבת להיות העדיפות הנמוכה ביותר) |

> ⚠️ **חשוב:** הרשומה הזו מנתבת את **כל** הדואר הנכנס של `chasamsofer.info` ל-Resend. מכיוון שזה דומיין חדש שלא מנהל מייל במקום אחר (כמו Google Workspace) — זה בטוח. אם בעתיד תרצה תיבות מייל רגילות על הדומיין, נצטרך לתכנן זאת אחרת (למשל קבלה על תת-דומיין כמו `inbox.chasamsofer.info`).

---

## שלב 4 — מפתח API
ב-Resend ‹ **API Keys** ‹ **Create API Key** (הרשאת Sending מספיקה לשליחה; לקבלה ושליפת תוכן צריך גישת Full access או Receiving). העתק את המפתח `re_...` — הוא מוצג פעם אחת.

---

## שלב 5 — משתני סביבה ב-Vercel
Vercel ‹ הפרויקט ‹ **Settings** ‹ **Environment Variables**. הוסף (Production + Preview):

| משתנה | ערך |
|-------|-----|
| `RESEND_API_KEY` | המפתח `re_...` מהשלב הקודם |
| `MAILBOX_FROM_ADDRESS` | `office@chasamsofer.info` |
| `MAILBOX_FROM_NAME` | `היכל החתם סופר` |
| `RESEND_WEBHOOK_SECRET` | מחרוזת אקראית ארוכה שתמציא (לדוגמה: פלט של `openssl rand -hex 24`) |

> ודא שכבר קיימים `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — הם נדרשים גם לתיבת הדואר. רשימה מלאה ב-`.env.example`.

אחרי הוספת המשתנים — **Redeploy** לפרויקט כדי שייכנסו לתוקף.

---

## שלב 6 — Webhook למייל נכנס
1. Resend ‹ **Webhooks** ‹ **Add Webhook**.
2. **Endpoint URL:**
   ```
   https://<כתובת-האפליקציה>/api/admin/mailbox/inbound?secret=<RESEND_WEBHOOK_SECRET>
   ```
   (החלף `<כתובת-האפליקציה>` בכתובת ה-Vercel/הדומיין של האתר, ו-`<RESEND_WEBHOOK_SECRET>` בערך שהגדרת בשלב 5.)
3. **Events:** סמן `email.received` בלבד.
4. שמור.

> איך זה עובד: Resend שולח ל-webhook **מטא-דאטה בלבד**. המערכת משלימה אוטומטית את גוף ההודעה, ה-HTML והקבצים בקריאת API חוזרת ל-Resend (זה כבר ממומש בקוד). לכן חובה שמפתח ה-API יאפשר קריאת מיילים נכנסים.

---

## שלב 7 — מסד הנתונים
אם עוד לא הרצת — פתח Supabase ‹ **SQL Editor**, הדבק את התוכן של
`supabase/migrations/20260604_mailbox.sql` והרץ. זה יוצר את הטבלאות `mail_messages` / `mail_attachments`, הרשאות, ודלי אחסון.

---

## שלב 8 — בדיקה
**שליחה:** היכנס למערכת כמנהל ‹ **תיבת דואר** ‹ **כתוב הודעה** ‹ שלח לעצמך. אמור להגיע מייל מ-`office@chasamsofer.info`, ולהופיע בתיקיית "נשלח".

**קבלה:** השב לאותו מייל מתיבה חיצונית (Gmail וכו'). תוך שניות אמור להופיע ב"דואר נכנס" עם הגוף המלא (בזכות שלב 6).

---

## פתרון תקלות
- **"שירות המייל (Resend) אינו מוגדר"** → חסר `RESEND_API_KEY` או `MAILBOX_FROM_ADDRESS`, או שלא עשית Redeploy.
- **השליחה נכשלת עם 403/validation** → הדומיין עדיין לא Verified ב-Resend, או ש-`MAILBOX_FROM_ADDRESS` לא על הדומיין המאומת.
- **מייל נכנס לא מופיע** → בדוק: רשומת MX על השורש פעילה (`dig MX chasamsofer.info`); ה-Webhook מצביע לכתובת הנכונה עם ה-`secret`; אירוע `email.received` מסומן. ב-Resend ‹ Webhooks רואים את היסטוריית המשלוחים והשגיאות.
- **מייל נכנס מופיע אך ריק** → מפתח ה-API לא מורשה לקרוא מיילים נכנסים (צריך Full access/Receiving).
- **רשומות לא מתאמתות** → המתן עד 24 שעות; ודא שלא הוספת כפילות או נקודה מיותרת ב-Host.

> הערה: כרגע **קבצים מצורפים בדואר נכנס** מסומנים (מהדק נייר) אך אינם ניתנים להורדה ישירה מהמערכת — זו הרחבה עתידית (הורדת הקובץ מ-Resend ושמירתו ב-Storage). שליחת קבצים מצורפת עובדת כרגיל.
