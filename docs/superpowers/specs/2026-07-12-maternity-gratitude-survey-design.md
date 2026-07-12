# מכתבי ברכה לנדיב + סקר שביעות רצון מבית ההחלמה

**תאריך:** 2026-07-12
**סטטוס:** מאושר לתכנון מימוש

---

## 1. מטרה

שני מסלולי משוב אוטומטיים ליולדות, שנשלחים בעיתוי הנכון אחרי אירוע במערכת:

1. **מכתב ברכה לנדיב** — 10 ימים אחרי אישור הלידה. בקשה (לא חובה) לכתוב דברי הכרת הטוב לנדיב שמימן את הסיוע. התוצר: שובר PDF מעוצב שאפשר להעביר לנדיב.
2. **סקר שביעות רצון מבית ההחלמה** — 5 ימים אחרי שבית ההחלמה סימן בפורטל שהיולדת הגיעה. מטרתו כפולה: לתת ליולדת תחושה שדואגים לה, ולייצר דירוג ניהולי אמיתי לכל בית החלמה.

**עיקרון מנחה:** אף מייל אוטומטי לא נשלח בשבת, ביום טוב, או בערב חג אחרי הצהריים. זה כלל גורף על כל התשתית, לא רק על שני המיילים האלה.

---

## 2. תשתית חוצה־מערכת

שני מרכיבים חדשים שמשרתים את שתי הפיצ'רים — וגם כל תזמון עתידי במערכת.

### 2.1 `lib/jewishCalendar.ts` — לוח שנה עברי לשליחת מיילים

`@hebcal/core@6.6.0` **כבר מותקן** ובשימוש בפרויקט ([components/layout/HeaderDateTime.tsx:65](components/layout/HeaderDateTime.tsx#L65), [components/ui/HebrewDatePicker.tsx](components/ui/HebrewDatePicker.tsx)). אין תלות חדשה.

**API:**

```ts
isBlockedForMail(when: Date): boolean
nextAllowedSendTime(desired: Date): Date
```

**כללי החסימה** (סוכמו ואושרו):

| מצב | חסום? |
|---|---|
| שבת (מכניסת שבת עד צאתה) | ✅ חסום |
| יום טוב (ר"ה, יוה"כ, סוכות א'+שמע"צ, פסח א'+ז', שבועות) | ✅ חסום |
| ערב שבת / ערב חג — מ-14:00 והלאה | ✅ חסום |
| חול המועד | ❌ מותר (יום עבודה בפועל בישראל) |
| ראש חודש, חנוכה, פורים, ל"ג בעומר, ימי צום | ❌ מותר |
| ימי חג מודרניים (יום העצמאות וכו') | ❌ מותר |

**מימוש:**
- זיהוי יו"ט: `HebrewCalendar.getHolidaysOnDate(new HDate(d), true)` + בדיקת `flags.CHAG` (מסנן החוצה `MODERN_HOLIDAY` ו-`CHOL_HAMOED`, בדיוק כמו הדפוס הקיים ב-`HeaderDateTime.tsx:67`).
- כל החישובים ב-`Asia/Jerusalem`, בעזרת `Intl.DateTimeFormat` — אותו דפוס כמו `israelParts()` ב-[instrumentation.ts:11](instrumentation.ts#L11).
- `nextAllowedSendTime` דוחה קדימה יום־יום עד שמוצא יום מותר, ואז מקבע **09:00 שעון ישראל**. תקרת בטיחות של 14 איטרציות (מונעת לולאה אינסופית).

**החלטת מימוש מודעת:** שעות כניסת/צאת השבת מחושבות **לפי יום הלוח**, לא לפי `Zmanim` מדויק — כלומר "אחרי 14:00 בערב שבת = חסום", ולא "אחרי הזמן המדויק של הדלקת נרות". הסיבה: זו חסימה שמרנית שתמיד בטוחה, והיא לא תלויה במיקום גיאוגרפי. מוקדם יותר מהנדרש = בטוח.

### 2.2 טבלת `scheduled_emails` — תור מיילים מתוזמנים

תשתית גנרית. במקום שכל פיצ'ר ימציא לעצמו לוגיקת "שלח בעוד N ימים", יש טבלה אחת + worker אחד.

```sql
create table if not exists public.scheduled_emails (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,            -- 'gratitude_letter' | 'recovery_survey' | ...
  entity_table text not null,            -- 'maternity_aids'
  entity_id    uuid not null,
  to_email     text not null,
  send_after   timestamptz not null,     -- כבר מותאם לשבת/חג בעת הקביעה
  status       text not null default 'pending'
               check (status in ('pending','sent','cancelled','failed')),
  attempts     int  not null default 0,
  last_error   text,
  payload      jsonb not null default '{}'::jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- מונע כפילות: מייל אחד מכל סוג לכל ישות
create unique index if not exists scheduled_emails_unique
  on public.scheduled_emails (kind, entity_table, entity_id);

create index if not exists scheduled_emails_due
  on public.scheduled_emails (send_after) where status = 'pending';

alter table public.scheduled_emails enable row level security;
-- service-role בלבד (אין policies) — עקבי עם app_settings
```

**האינדקס הייחודי הוא ההגנה המרכזית מפני שליחה כפולה.** גם אם הקוד נקרא פעמיים, ה-DB דוחה.

### 2.3 Worker — `lib/scheduledMail.ts`

```ts
export async function runScheduledMail(): Promise<{ sent: number; failed: number }>
```

זרימה:
1. שולף `pending` עם `send_after <= now()`, מוגבל ל-50 בריצה.
2. **בדיקה כפולה של שבת/חג** — גם אם ה-`send_after` חושב נכון, השרת יכול היה להיות למטה ולעלות בשבת. אם `isBlockedForMail(now)` — דוחה את `send_after` ל-`nextAllowedSendTime` ומדלג.
3. **בדיקת רלוונטיות** — לפני שליחה, מוודא שהישות עדיין תקפה (לידה עדיין `active`, לא בוטלה). אם לא — `status='cancelled'`.
4. בונה את המייל לפי `kind` ושולח דרך `deliverMail`.
5. `sent` בהצלחה. בכישלון: `attempts++`, ואחרי 3 ניסיונות → `failed`.

**רישום ב-`instrumentation.ts`:** בדיקה שעתית, kill-switch `SCHEDULED_MAIL_DISABLED=1`, לפי דפוס `runUnloadExpired` הקיים.

**מנעול ריצה כפולה:** Railway עשוי להריץ יותר ממכונה אחת. ה-worker לוקח `pg_try_advisory_lock` בתחילת הריצה ומשחרר בסוף. אם המנעול תפוס — יוצא מיד. (זהו גם תיקון של באג קיים בכל ה-workers האחרים, אבל מחוץ לסקופ כאן.)

### 2.4 מוטבת ללא כתובת מייל

`beneficiaries.email` הוא **nullable** — יש רשומות בלי מייל.

**`scheduleEmail()` לא ייצור שורה בלי `to_email` תקין.** במקום זה: `console.warn` ודילוג שקט. **לא זורק שגיאה** — אחרת אישור לידה של מוטבת ללא מייל ייכשל, וזו רגרסיה חמורה בזרימה קיימת שעובדת.

**המשמעות התפעולית:** מוטבת בלי מייל פשוט לא תקבל בקשת מכתב ברכה ולא סקר. זו התנהגות מקובלת — אבל כדאי שתדע שזה קורה. בעתיד אפשר להוסיף מסך "לא נשלח בגלל היעדר מייל", מחוץ לסקופ הנוכחי.

---

## 3. פיצ'ר א' — מכתב ברכה לנדיב

### 3.1 טריגר

ב-[app/api/admin/request-approved/route.ts](app/api/admin/request-approved/route.ts), בבלוק הרקע (שורה ~107), אחרי שליחת מייל האישור:

```ts
await scheduleEmail({
  kind: 'gratitude_letter',
  entityTable: 'maternity_aids',
  entityId: aid.id,
  toEmail: beneficiary.email,
  sendAfter: nextAllowedSendTime(addDays(new Date(), 10)),
})
```

**לידה שקטה (`birth_type='silent'`) לא מקבלת את המייל הזה.** זה עקבי עם ההתנהגות הקיימת שלא שולחת לה שוברים ([request-approved/route.ts:119](app/api/admin/request-approved/route.ts#L119)).

**ביטול אוטומטי:** אם הלידה עוברת ל-`cancelled` — ה-worker מזהה בשלב 3 ומבטל את המייל הממתין.

### 3.2 טבלת `gratitude_letters`

```sql
create table if not exists public.gratitude_letters (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  source           text not null check (source in ('web','email','scan')),
  body             text,          -- הטקסט שנכתב (web/email)
  signature        text,          -- שורת החתימה שהיולדת בחרה
  is_anonymous     boolean not null default true,
  scan_url         text,          -- תמונת שובר מודפס שנשלחה חזרה
  voucher_url      text,          -- ה-PDF המעוצב שנוצר
  status           text not null default 'received'
                   check (status in ('received','approved','rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists gratitude_letters_aid  on public.gratitude_letters (maternity_aid_id);
create index if not exists gratitude_letters_date on public.gratitude_letters (created_at desc);

alter table public.gratitude_letters enable row level security;
drop policy if exists gratitude_letters_staff_all on public.gratitude_letters;
create policy gratitude_letters_staff_all on public.gratitude_letters
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
```

**שים לב:** `status` מאפשר לך **לאשר מכתב לפני שהוא מועבר לנדיב**. מכתב יכול להכיל תוכן לא ראוי, שגיאות, או פרטים אישיים — אתה מסנן.

### 3.3 המייל

תבנית חדשה `gratitudeRequestEmail` ב-[lib/emailTemplates.ts](lib/emailTemplates.ts), על גבי `shell()` הקיים. פנייה: `greetMrs()`.

תוכן: הסבר קצר וחם שהסיוע התאפשר בזכות נדיב, ושמכתב תודה יחמם את ליבו. **הדגשה מפורשת שזו לא חובה.**

שלושה מסלולי מענה במייל אחד:
1. **כפתור ראשי** → קישור ייחודי לטופס web
2. **צרופת PDF** — שובר ריק להדפסה וכתיבה ביד
3. **"או פשוט השיבי למייל הזה"** — הטקסט שתכתבי ייכנס אוטומטית לשובר

### 3.4 שובר הברכה (PDF)

קובץ חדש `lib/gratitudeVoucher.ts`, **בשימוש חוזר מלא** בעוזרים הקיימים מ-[lib/maternityVoucher.ts](lib/maternityVoucher.ts): `drawHeader`, `goldDivider`, `isoNum`, `HEEBO_TTF_B64`, ערכת הצבעים (NAVY/GOLD/CREAM).

**כדי לאפשר שימוש חוזר נקי — refactor קטן:** חילוץ העוזרים המשותפים מ-`maternityVoucher.ts` ל-`lib/voucherKit.ts`. שני הקבצים מייבאים ממנו. **אין שינוי התנהגותי בשוברים הקיימים.**

**שני מצבי רינדור מאותה פונקציה:**

| מצב | תיאור |
|---|---|
| `blank` | כותרת "דברי ברכה" · **8 שורות ריקות מקווקוות** לכתיבה ביד · "בכבוד רב," · שורה אחת קטנה לשם |
| `filled` | אותו עיצוב בדיוק, אבל הטקסט של היולדת **מודפס בפונט Heebo** על השורות, והחתימה מודפסת בשורת השם |

הפריסה זהה בשני המצבים — ההבדל היחיד הוא אם השורות ריקות או מלאות. זה מה שנותן את התחושה של "הטקסט שהיא כתבה נשתל בתוך שובר".

**גלישת טקסט:** `wrapText` מ-[lib/rtlText.ts](lib/rtlText.ts) (קיים). אם הטקסט ארוך מ-8 שורות — נשפך לעמוד שני עם אותו header.

**אנונימיות:** אם `is_anonymous=true`, השובר **לא מכיל שום פרט מזהה** — לא שם, לא ת"ז, לא תאריך לידה. רק הברכה והחתימה שהיא בחרה (למשל "משפחה מודה מבני ברק"). אם `false` — שם המשפחה מודפס.

### 3.5 מסלול 1: טופס Web

**קישור ייחודי:** `/gratitude/<token>`

**הטוקן:** HMAC-SHA256 חתום, לפי הדפוס הקיים ב-[lib/portalSession.ts](lib/portalSession.ts) — `timingSafeEqual`, סוד `OTP_NONCE_SECRET`. מקודד `{ aidId, kind:'gratitude', exp }`, תוקף 90 יום. **חד-פעמי:** אחרי שליחה, `gratitude_letters` כבר מכיל רשומה → הדף מציג "כבר קיבלנו את מכתבך, תודה!" עם תצוגת השובר.

**הדף (ציבורי, ללא התחברות):**
- תיבת טקסט גדולה + מונה תווים (מקסימום 1,500)
- שדה חתימה + **checkbox "אני מאשרת לציין את שמי"** (ברירת מחדל: **לא** מסומן = אנונימי)
- כפתור **"תצוגה מקדימה"** → מייצר את ה-PDF בזמן אמת ומציג אותו
- כפתור שליחה

**אבטחה (דפוס `public-register` הקיים):** `rateLimit()` · service-role client · אימות טוקן · sanitization של הטקסט (הסרת HTML).

### 3.6 מסלול 2: מענה במייל

**זיהוי:** המייל היוצא נושא כותרת `Reply-To` עם plus-addressing:
`office+g<token>@chasamsofer.info`

Resend Inbound מעביר את זה ל-[app/api/webhooks/resend-inbound/route.ts](app/api/webhooks/resend-inbound/route.ts) הקיים. שם נוסיף בדיקה: אם ה-`to` מכיל `+g<token>` → ניתוב ל-handler של מכתבי ברכה במקום הזרימה הרגילה.

**גיבוי לזיהוי** (למקרה שהלקוח האימייל מתעלם מ-Reply-To): כותרת `X-Entity-Ref-ID` + התאמה לפי `from_email` מול `beneficiaries.email` + קיום `scheduled_email` מסוג `gratitude_letter` שנשלח ב-30 הימים האחרונים.

**עיבוד:**
1. חילוץ גוף המייל וניקוי — **הסרת ציטוטים** (`On ... wrote:`, `>` בתחילת שורה, `<blockquote>`, מפרידי Gmail). זה קריטי, אחרת המייל המקורי שלנו ייכנס לשובר.
2. אם יש **צרופת תמונה** → זה סריקה של שובר מודפס. `source='scan'`, שמירה ל-Storage, ללא רינדור PDF.
3. אחרת: `source='email'`, הטקסט → `body`, רינדור PDF במצב `filled`.
4. `is_anonymous=true` כברירת מחדל (במסלול המייל אין checkbox). **אלא אם** הטקסט מכיל את המילים "אפשר לפרסם את שמי" / "מותר לציין את שמי" — אז `false`. אחרת: אתה יכול להחליף ידנית בלשונית.

**מייל אישור** נשלח חזרה: "קיבלנו את מכתבך, תודה רבה" + השובר המעוצב מצורף.

### 3.7 לשונית "מכתבי ברכה"

**מיקום:** תת-לשונית תחת "יולדות" ב-[components/layout/Sidebar.tsx](components/layout/Sidebar.tsx) — נוספת ל-`maternityChildren` (שורה 36), לצד "עזר יולדות" / "לידה שקטה" / "כרטיסי מזון".

**מסך `/admin/maternity/gratitude`:**
- טבלה: תאריך · שם היולדת · מקור (web/מייל/סריקה — אייקון) · תצוגה מקדימה של הטקסט · סטטוס
- **סינון** לפי סטטוס ומקור
- לחיצה על שורה → מודל עם השובר המלא + כפתורי **אשר / דחה** + **הורדת PDF** + עריכת החתימה/אנונימיות ורינדור מחדש
- **הרשאות:** `SectionKey` חדש — `'gratitude'`

---

## 4. פיצ'ר ב' — סקר בית החלמה

### 4.1 טריגר

**נקודת הטריגר המדויקת:** [app/api/portal/arrived/route.ts:38](app/api/portal/arrived/route.ts#L38) — ה-endpoint שבו צוות בית ההחלמה מסמן בפורטל שלו שהיולדת הגיעה.

```ts
if (arrived === true) {
  await scheduleEmail({
    kind: 'recovery_survey',
    entityTable: 'maternity_aids',
    entityId: aidId,
    toEmail: beneficiary.email,
    sendAfter: nextAllowedSendTime(addDays(new Date(), 5)),
    payload: { recovery_home: home },
  })
}
```

### 4.1.1 ⚠️ ביטול סימון "הגיעה" — פער שהתגלה בקוד

ה-endpoint מקבל **שלושה ערכים**: `true` / `false` / `null` ([arrived/route.ts:20](app/api/portal/arrived/route.ts#L20)). כלומר בית ההחלמה **יכול לסמן "הגיעה" בטעות ואז לבטל**.

**ללא טיפול:** הסקר כבר תוזמן, וייצא ליולדת שמעולם לא הגיעה.

**הטיפול:** ב-`arrived !== true` — ביטול המייל הממתין:
```ts
await cancelScheduledEmail({ kind: 'recovery_survey', entityTable: 'maternity_aids', entityId: aidId })
// עדכון scheduled_emails ל-status='cancelled' — רק אם עדיין 'pending'
```

**סימון חוזר ל-`true`:** האינדקס הייחודי ימנע יצירת שורה שנייה. לכן `scheduleEmail` יעשה **upsert** — אם קיימת שורה `cancelled`, היא מוחזרת ל-`pending` עם `send_after` חדש. אם קיימת `sent` — לא נוגעים (לא שולחים סקר פעמיים).

### 4.2 שאלות הסקר — **בטבלה, לא בקוד**

אמרת שייתכן שתשנה את השאלות. לכן הן נשמרות ב-DB ואפשר לערוך אותן מההגדרות בלי שינוי קוד.

```sql
create table if not exists public.survey_questions (
  id       uuid primary key default gen_random_uuid(),
  survey   text not null default 'recovery',
  position int  not null,
  text     text not null,
  type     text not null default 'scale' check (type in ('scale','text')),
  is_active boolean not null default true
);
```

**Seed ראשוני:**

| # | שאלה | סוג |
|---|---|---|
| 1 | הקבלה והליווי בבית ההחלמה | 1–10 |
| 2 | ניקיון החדר והמתקנים | 1–10 |
| 3 | האוכל והכיבוד | 1–10 |
| 4 | האם תמליצי לחברה על בית ההחלמה הזה? | 1–10 |
| 5 | הערות — משהו שהיינו יכולים לשפר? | טקסט חופשי (אופציונלי) |

### 4.3 טבלת `survey_responses`

```sql
create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  recovery_home    text,        -- סנאפשוט בזמן המענה (שם בית ההחלמה עשוי להשתנות)
  source           text not null check (source in ('web','email')),
  answers          jsonb not null default '{}'::jsonb,  -- { "<question_id>": 8, ... }
  free_text        text,
  created_at       timestamptz not null default now()
);

-- חד-פעמיות: תשובה אחת לכל לידה
create unique index if not exists survey_responses_unique
  on public.survey_responses (maternity_aid_id);

create index if not exists survey_responses_home on public.survey_responses (recovery_home);
alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_staff_all on public.survey_responses;
create policy survey_responses_staff_all on public.survey_responses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
```

**האינדקס הייחודי הוא מנגנון החד-פעמיות** שביקשת — פעם אחת לכל לידה, ברמת ה-DB.

### 4.4 מסלול 1: טופס Web

`/survey/<token>` — אותו מנגנון טוקן חתום. סליידר או כפתורי 1–10 לכל שאלה, שדה טקסט חופשי, שליחה. אחרי מענה: "תודה, קיבלנו!" והקישור לא מקבל תשובה נוספת.

### 4.5 מסלול 2: מענה במייל במספרים

**המייל** מציג את השאלות ממוספרות, ומסביר:

> אפשר להשיב פשוט במייל חוזר, בשורה אחת:
> **`1-8 2-9 3-7 4-10`**
> (מספר השאלה, מקף, הציון מ-1 עד 10)

**הפרסר** (`lib/surveyParse.ts`) גמיש בכוונה — קולט את כל הפורמטים האלה:
- `1-8 2-9 3-7 4-10`
- `1. 8` / `2. 9` (בשורות נפרדות)
- `1: 8, 2: 9`
- `8 9 7 10` (רק מספרים לפי הסדר — אם המספר תואם למספר השאלות)

טווח חוקי: 1–10. ערך מחוץ לטווח נזרק. שורות טקסט שלא נפרסרו → `free_text`.

**אם הפרסר נכשל לגמרי:** נשלח מייל חוזר עדין — "לא הצלחנו לקרוא את התשובה, אפשר למלא כאן:" + קישור לטופס.

### 4.6 תצוגה באדמין

**א. במסך "בתי החלמה"** ([app/admin/maternity/recovery/RecoveryHomesView.tsx](app/admin/maternity/recovery/RecoveryHomesView.tsx)) — לכל בית החלמה:
**★ 8.4 · 23 תשובות** — ממוצע כולל + פירוט לפי שאלה.

זה מה שהופך את הסקר מ"נחמד" לכלי ניהולי. תוכל להשוות בתי החלמה ולראות מגמות.

**ב. טאב "סקרים"** בתוך אותו מסך — טבלת התשובות הגולמיות עם הטקסט החופשי.

---

## 5. אבטחה

| נושא | פתרון |
|---|---|
| טוקנים | HMAC-SHA256 חתום · `timingSafeEqual` · תוקף 90 יום · לא ניתן לניחוש |
| Rate limiting | `rateLimit()` הקיים על כל endpoint ציבורי |
| RLS | service-role בלבד לגישה ציבורית; `is_staff()` לצוות — הדפוס הקיים |
| XSS | sanitization של כל טקסט חופשי לפני שמירה ולפני רינדור |
| ספאם במייל הנכנס | אימות שקיים `scheduled_email` תואם; דחיית מיילים ללא התאמה |
| חד-פעמיות | אינדקס ייחודי ב-DB (לא רק בדיקה בקוד) |
| שליחה כפולה | אינדקס ייחודי על `scheduled_emails` + advisory lock ב-worker |

---

## 6. קבצים

### מיגרציות (2)
- `20260722_scheduled_emails.sql` — התור
- `20260723_gratitude_and_survey.sql` — `gratitude_letters`, `survey_questions` (+seed), `survey_responses`

### Lib (7)
| קובץ | תפקיד |
|---|---|
| `lib/jewishCalendar.ts` | **חדש** — חסימת שבת/חג |
| `lib/scheduledMail.ts` | **חדש** — worker + `scheduleEmail()` |
| `lib/voucherKit.ts` | **חדש** (refactor) — עוזרי PDF משותפים |
| `lib/gratitudeVoucher.ts` | **חדש** — שובר הברכה (blank/filled) |
| `lib/surveyParse.ts` | **חדש** — פרסינג תשובות מספריות |
| `lib/maternityVoucher.ts` | ייבוא מ-`voucherKit` (ללא שינוי התנהגות) |
| `lib/emailTemplates.ts` | +2 תבניות |

### API (5)
- `app/api/public/gratitude/[token]/route.ts` — GET (טעינה) + POST (שליחה)
- `app/api/public/gratitude/preview/route.ts` — תצוגה מקדימה של ה-PDF
- `app/api/public/survey/[token]/route.ts` — GET + POST
- `app/api/admin/gratitude/[id]/route.ts` — אישור/דחייה/רינדור מחדש
- `app/api/webhooks/resend-inbound/route.ts` — **הרחבה** לניתוב plus-addressing

### דפים (4)
- `app/gratitude/[token]/page.tsx` — טופס ציבורי
- `app/survey/[token]/page.tsx` — סקר ציבורי
- `app/admin/maternity/gratitude/page.tsx` — לשונית האדמין
- `app/admin/maternity/recovery/` — **הרחבה** בציוני הסקר

### נגיעות
- `instrumentation.ts` — רישום ה-worker
- `components/layout/Sidebar.tsx` — תת-לשונית
- `types/index.ts` — `SectionKey` + טיפוסים
- `app/api/admin/request-approved/route.ts` — תזמון מכתב הברכה
- הנקודה שבה `recovery_arrived` נקבע — תזמון הסקר

---

## 7. בדיקות

**קריטי — `lib/jewishCalendar.ts`:** בדיקות יחידה מול תאריכים ידועים. יום כיפור תשפ"ו, שבת רגילה, ערב פסח ב-15:00, חול המועד סוכות (חייב לעבור!), ערב שבת ב-10:00 (חייב לעבור).

**`lib/surveyParse.ts`:** כל הפורמטים + קלט זבל + ערכים מחוץ לטווח.

**ניקוי ציטוטים במייל:** תשובה מ-Gmail, מ-Outlook, ומהמובייל — ולוודא שהמייל המקורי לא נכנס לשובר.

**End-to-end ידני:** אישור לידה → אימות שנוצרה שורה ב-`scheduled_emails` עם התאריך הנכון → הרצת ה-worker ידנית → קבלת המייל → מענה בכל אחד משלושת המסלולים → אימות שהשובר נוצר נכון ומופיע בלשונית.

---

## 8. מה מודע ומחוץ לסקופ

- **שעות שבת מדויקות** — חסימה שמרנית מ-14:00, לא `Zmanim` לפי מיקום. בטוח יותר.
- **תזכורת שנייה** ליולדות שלא ענו — לא בגרסה זו. התשתית (`scheduled_emails`) תומכת בזה בקלות בעתיד.
- **העברת המכתבים לנדיב** — אתה מוריד PDF ומעביר. אין אוטומציה מול הנדיב.
- **advisory lock ב-workers הקיימים** — באג ידוע (ריצה כפולה ב-multi-instance), מטופל רק ב-worker החדש.
