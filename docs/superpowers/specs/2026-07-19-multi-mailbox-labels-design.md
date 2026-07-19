# אפיון: חיבור תיבות Gmail ישנות מרובות — מחלקה + תווית לכל תיבה

**תאריך:** 19.07.2026
**סטטוס:** ממתין לאישור המשתמש

## הבעיה

כיום חיבור "מייל קודם" תומך ב**תיבת Gmail אחת בלבד**: הטוקן נשמר במפתח גלובלי
יחיד (`app_settings.gmail_legacy_refresh_token`), והסנכרון (`syncLegacyMail`)
תמיד קורא ממנו — מתעלם מ-`gmail_accounts.refresh_token`. גם הסמן
(`legacy_mail_last_sync`) גלובלי, כך שסנכרון תיבה אחת "מדלג" את כל השאר.

המשתמש צריך **כמה תיבות Gmail ישנות נפרדות**, כשכל אחת:
- מחוברת בנפרד (טוקן משלה),
- משויכת ל**מחלקה**,
- ומקבלת **תווית ייעודית** — וכל מייל שנמשך מהתיבה מקבל אוטומטית את התווית.
- כמה תיבות יכולות להשתייך לאותה מחלקה, אך כל אחת עם תווית משלה.

## החלטות שהתקבלו (עם המשתמש, 19.07.2026)

- **תווית** = תווית במערכת שלנו (`mail_label_defs`), לא תווית Gmail. צבעונית, מוצגת בתיבה המאוחדת.
- **תיבה = תווית אחת** (יחס 1:1). כל המיילים מהתיבה מקבלים אותה תווית.
- **יצירת התווית בזמן החיבור** — בזרימת חיבור התיבה בוחרים מחלקה ומקלידים שם
  לתווית חדשה (או בוחרים תווית קיימת); התווית נוצרת ומשויכת לתיבה בו-רגע.
- **מיילים ישנים קיימים** — יישארו כמו שהם (מחלקה קיימת, בלי תווית), אבל תתווסף
  אפשרות לשייך אותם בדיעבד לתיבה/תווית.

## גישות שנשקלו

- **א. הרחבת התשתית הקיימת (נבחרה):** `gmail_accounts` כבר קיימת עם
  `refresh_token` ו-`last_sync_epoch` לכל תיבה. מוסיפים לה עמודת `label_id`,
  מתקנים את הסנכרון לקרוא פר-תיבה, ומחילים את התווית בזמן הייבוא. מינימלי,
  בונה על מה שקיים.
- **ב. שכתוב מלא של מנגנון החיבור** לטבלת accounts חדשה — מיותר, הטבלה כבר טובה.
- **ג. תוויות Gmail אמיתיות** (במקום התוויות שלנו) — נדחה ע"י המשתמש; התוויות
  שלנו כבר משולבות בכל מסך המייל.

## מודל הנתונים (מיגרציה — מריץ המשתמש ידנית)

`supabase/migrations/20260719_mailbox_label.sql`:

```sql
-- תווית קבועה לכל תיבת Gmail: כל מייל שנמשך ממנה יקבל אותה אוטומטית.
alter table public.gmail_accounts
  add column if not exists label_id text;
```

- `label_id` מפנה ל-`mail_label_defs[].id` (המאוחסן ב-`app_settings`, לא טבלה — לכן
  אין FK; אימות קיום התווית נעשה בקוד).
- אין שינוי בטבלת `inbound_emails` — התווית מוחלת דרך `mail_label_assignments`
  הקיים (messageId → labelId[]), כדי לא לפצל את מנגנון התוויות לשניים.

## זרימות

### 1. חיבור תיבה חדשה (עם מחלקה + תווית)

```
מסך הגדרות → "חיבור תיבת Gmail"
  → בוחר מחלקה (dropdown מ-DEPARTMENTS)
  → בוחר תווית קיימת  או  מקליד שם לתווית חדשה (+ צבע)
  → state = { department, labelName|labelId, color } מקודד ב-OAuth state (base64url)
  → הרשאת Google (readonly) → callback
  → callback:
      • יוצר תווית חדשה אם צריך (create_label ב-mail_label_defs) ומקבל labelId
      • upsert ל-gmail_accounts: { email, label, department, label_id, refresh_token }
      • ⚠️ לא דורס טוקן גלובלי (מסיר את saveLegacyRefreshToken הישן)
  → חזרה למסך ההגדרות
```

### 2. סנכרון פר-תיבה (התיקון הארכיטקטוני)

```
sync(box) → POST /api/admin/legacy-mail/sync { accountId }
  → הראוט טוען מ-gmail_accounts: refresh_token, department, label_id, last_sync_epoch
  → syncLegacyMailForAccount(admin, account, { full }):
      • getGmailClientForToken(account.refresh_token)  ← לא הטוקן הגלובלי
      • הסמן: account.last_sync_epoch (פר-תיבה!) — לא הגלובלי
      • לכל מייל: department = account.department (לא נגזר מ-To)
      • אחרי upsert מוצלח: אם account.label_id — מוסיף ל-mail_label_assignments
      • בסוף: מעדכן gmail_accounts.{last_sync_epoch, last_sync_at, total_synced, ...}
```

תאימות לאחור: אם עדיין קיים הטוקן הגלובלי הישן (`gmail_legacy_refresh_token`)
ואין לו רשומה ב-`gmail_accounts` — ממשיכים לסנכרן אותו בנתיב הישן (התיבה
"תיבת ארכיון (חיבור קיים)" שכבר מופיעה ב-status). לא שוברים תיבות קיימות.

### 3. שיוך מיילים ישנים בדיעבד

```
במסך ההגדרות, לכל תיבה: כפתור "שייך מיילים קיימים לתווית"
  → POST /api/admin/legacy-mail/apply-label { accountId }
  → מוצא את כל inbound_emails עם source='legacy' ו-department=account.department
    שאין להם עדיין את התווית → מוסיף account.label_id ל-mail_label_assignments
```

## רכיבים ושינויים

### DB / lib
- `supabase/migrations/20260719_mailbox_label.sql` — עמודת `label_id`.
- **`lib/legacyMailSync.ts`** — פיצול: `syncLegacyMailForAccount(admin, account, opts)`
  שמקבל account (טוקן + department + label_id + epoch פר-תיבה). הפונקציה הישנה
  `syncLegacyMail` נשמרת כ-wrapper לתאימות לאחור (הטוקן הגלובלי).
- **`lib/gmail.ts`** — `getGmailClientForToken(refreshToken)` גנרי (הקיים
  `getLegacyGmailClient` הופך ל-wrapper עליו).

### API
- **`app/api/auth/gmail-legacy/callback/route.ts`** — יצירת/בחירת תווית + שמירת
  `label_id`; הסרת הכתיבה לטוקן הגלובלי.
- **`app/api/auth/gmail-legacy/route.ts`** (או מסך החיבור) — העברת `label`/`labelId`/`color` ב-state.
- **`app/api/admin/legacy-mail/sync/route.ts`** — טעינת ה-account המלא והפעלת
  `syncLegacyMailForAccount`; החלת התווית אחרי הייבוא.
- **`app/api/admin/legacy-mail/apply-label/route.ts` (חדש)** — שיוך בדיעבד.

### UI
- **`app/admin/settings/LegacyMailSettings.tsx`** — מסך החיבור: בחירת מחלקה +
  שדה תווית (קיימת/חדשה + צבע). לכל תיבה: הצגת התווית שלה + כפתור "שייך מיילים קיימים".
- **מסך החיבור** (`connect-mailbox` אם קיים) — הוספת שלב בחירת התווית לפני ההפניה ל-Google.

## טיפול בשגיאות ומקרי קצה
- תיבה כבר מחוברת (upsert onConflict: 'email') — מעדכן מחלקה/תווית, לא מכפיל.
- תווית שנמחקה אחרי שיוך — הצגה מתעלמת ממנה (כמו היום ב-delete_label).
- כשל ביצירת תווית — לא חוסם את חיבור התיבה (התיבה נשמרת בלי label_id, ניתן להשלים).
- הטוקן הגלובלי הישן — נשאר עובד עד שהמשתמש מחבר מחדש; לא נמחק אוטומטית.

## בדיקות
- יחידה: `syncLegacyMailForAccount` מחיל את ה-department וה-label הנכונים (mock gmail+db).
- יחידה: החלת התווית ב-mail_label_assignments (הוספה בלי כפילות).
- ידני: חיבור 2 תיבות לאותה מחלקה עם 2 תוויות → כל מייל מקבל את תווית תיבתו.

## מחוץ לתחולה
- תוויות Gmail אמיתיות (נדחה).
- יחס תיבה↔כמה תוויות (נבחר 1:1).
- מחיקת/ניתוק תיבה מה-UI (קיים חלקית; לא נרחיב כעת).
