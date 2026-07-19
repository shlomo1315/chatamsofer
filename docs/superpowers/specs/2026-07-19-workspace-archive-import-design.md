# אפיון: ייבוא מיילים ישנים ל-Google Workspace (תיבות המחלקות)

**תאריך:** 19.07.2026
**סטטוס:** ממתין לאישור המשתמש

## המטרה

להזריק את כל המיילים הישנים לתוך תיבות ה-Gmail האמיתיות של המחלקות ב-Google
Workspace — **במקביל למערכת ולגמרי בלי קשר אליה**. הצוות יראה את המיילים
הישנים ישירות ב-Gmail שלו (לא רק ב"ארכיון מייל קודם" שבתוכנה).

## החלטות שהתקבלו (עם המשתמש, 19.07.2026)

- **יעד:** כל מחלקה → תיבת ה-Gmail שלה. מייל ששויך לעזר יולדות → תיבת ה-Gmail
  של עזר יולדות, וכן לכל מחלקה.
- **הרשאות:** **Domain-wide delegation** — Service Account אחד עם הרשאה לכל
  ה-Workspace, מוגדר פעם אחת ב-Google Admin. המערכת מתחזה (impersonation)
  לתיבת היעד וכותבת אליה. לא צריך לחבר כל תיבה בנפרד ב-OAuth.
- **תיוג:** כל מייל נכנס עם תווית Gmail **"ארכיון מייל ישן"** (נוצרת אוטומטית
  בתיבת היעד), כדי להבחין מהדואר החי.
- **מניעת כפילויות:** מסמנים כל מייל שהוזרק, כך שהרצה חוזרת לא תכפיל.

## רקע — מה כבר קיים בקוד

- `lib/legacyMailSync.ts` כבר מושך מיילים ישנים ב-raw וכבר מזריק עותק לתיבת
  ה-office (`officeGmail.users.messages.insert` עם תווית "ארכיון מייל קודם").
  **הטכניקה מוכחת** — צריך רק להכלילה: להזריק לתיבת המחלקה במקום/בנוסף ל-office.
- הזרקה ל-Gmail = `messages.import` / `messages.insert` עם ה-raw המקורי. לא
  שולח לאף אחד; מוסיף להיסטוריה עם התאריך המקורי.
- הקוד כבר תלוי ב-`googleapis`.

## גישות שנשקלו

- **א. Domain-wide delegation (נבחרה):** Service Account + JWT עם `subject`
  (impersonation) לכל תיבת יעד. הגדרה חד-פעמית, מכסה את כל הארגון, לא דורש
  חיבור OAuth פר-תיבה. הדרך הסטנדרטית ל-Workspace.
- **ב. OAuth כתיבה פר-תיבה:** לחבר כל תיבת יעד ב-OAuth עם `gmail.insert`.
  עובד בלי גישת Admin, אבל דורש חיבור ידני של כל תיבה — נדחה לטובת א'.

## הגדרה חד-פעמית שהמשתמש עושה ב-Google (לא קוד — אני מלווה שלב-שלב)

1. Google Cloud Console → צור **Service Account** (או השתמש בקיים).
2. הפעל לו **Domain-wide delegation**, קבל את ה-**Client ID** שלו.
3. Google Admin Console → Security → API Controls → Domain-wide delegation →
   הוסף את ה-Client ID עם ה-scope: `https://www.googleapis.com/auth/gmail.insert`
   (או `gmail.modify` אם נרצה גם לתייג).
4. הורד את מפתח ה-JSON של ה-Service Account → נשמר כמשתנה סביבה
   `GOOGLE_SA_KEY` ב-Railway.

## מודל הנתונים (מיגרציה — מריץ המשתמש ידנית)

`supabase/migrations/20260719_gmail_import_tracking.sql`:

```sql
-- מעקב הזרקה ל-Gmail: מונע כפילות בהרצה חוזרת.
alter table public.inbound_emails
  add column if not exists imported_to_gmail_at timestamptz;

create index if not exists inbound_emails_gmail_import
  on public.inbound_emails (imported_to_gmail_at);
```

## רכיבים ושינויים

### lib
- **`lib/googleWorkspace.ts` (חדש):** לקוח Gmail דרך Service Account +
  impersonation.
  - `getWorkspaceGmailClient(mailboxEmail)` — בונה `google.auth.JWT` עם
    `GOOGLE_SA_KEY`, `subject: mailboxEmail`, scope `gmail.insert`/`gmail.modify`;
    מחזיר `google.gmail` מאומת כאותה תיבה.
  - `ensureArchiveLabel(gmail)` — יוצר/מאתר את תווית "ארכיון מייל ישן" בתיבה.
  - `importRawMessage(gmail, rawBase64, labelId)` — `messages.import` של ה-raw
    עם התווית (`internalDateSource: 'dateHeader'` כדי לשמור תאריך מקורי).
- **`lib/departments.ts`** — כבר ממפה מחלקה→email; משמש לבחירת תיבת היעד.

### API
- **`app/api/admin/legacy-mail/import-to-gmail/route.ts` (חדש):**
  - `requireAdmin` (פעולה רגישה — כותבת לתיבות הארגון).
  - קלט: `{ accountId? , department? , all? }` — איזו מחלקה/תיבה לייבא (או הכל).
  - שולף מ-`inbound_emails` את המיילים (source='legacy', מחלקה תואמת,
    `imported_to_gmail_at is null`), בבאצ'ים.
  - לכל מייל: קורא raw (שמור? אם לא — מושך מחדש מהמקור), מזריק לתיבת המחלקה,
    מסמן `imported_to_gmail_at`.
  - מחזיר {imported, skipped, failed}.
  - הערה: אם ה-raw לא נשמר ב-DB (רק html/plain), ייתכן שנצטרך למשוך אותו שוב
    מ-Gmail המקור בזמן הייבוא — או לשמור raw בסנכרון. יוכרע במימוש לפי הזמינות.

### UI
- **`app/admin/settings/LegacyMailSettings.tsx`** — כפתור לכל תיבה:
  **"ייבא ל-Gmail של המחלקה"**, עם אינדיקציה כמה יובאו/נותרו. אפשר גם כפתור
  כללי "ייבא הכל".

## טיפול בשגיאות ומקרי קצה
- תיבת יעד לא קיימת ב-Workspace / impersonation נכשל → מדווח, לא חוסם שאר התיבות.
- מייל בלי raw → נמשך מחדש מהמקור, ואם אין → מדולג ומדווח.
- הרצה חוזרת → `imported_to_gmail_at is null` מבטיח שכל מייל מוזרק פעם אחת.
- הגבלת קצב מול Gmail API (quota) → באצ'ים + השהיות; חידוש מהמקום שנעצר
  (בזכות הסימון פר-מייל).
- אבטחה: רק admin. ה-`GOOGLE_SA_KEY` הוא סוד — רק ב-env, לא בקוד/DB.

## בדיקות
- יחידה: בחירת תיבת היעד לפי מחלקה; דילוג על מיילים שכבר יובאו.
- יחידה: בניית ה-JWT עם subject נכון (mock).
- ידני: ייבוא תיבת מחלקה אחת → המיילים מופיעים ב-Gmail האמיתי עם התווית,
  בתאריך המקורי, בלי כפילויות בהרצה שנייה.

## מחוץ לתחולה
- סנכרון דו-כיווני (מה שקורה ב-Gmail חוזר למערכת) — לא. חד-כיווני: מערכת→Gmail.
- מחיקת מיילים מ-Gmail — לא.
- ייבוא מיילים חדשים (שנכנסים מעכשיו) ל-Gmail — כרגע רק הארכיון הישן; אפשר
  להרחיב בהמשך.

## תלות והגדרה שאתה צריך לספק
1. Service Account + Domain-wide delegation ב-Google Admin (מלווה שלב-שלב).
2. `GOOGLE_SA_KEY` (JSON) כמשתנה סביבה ב-Railway.
3. הרצת מיגרציית ה-tracking.
בלי (1)+(2) אי אפשר לכתוב לתיבות — זו דרישת קדם חיצונית.
