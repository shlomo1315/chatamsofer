# אפיון: מעגל תיקונים — השלמת מסמכים + תיקון עץ דורות + סטטוס "הוחזר תיקון"

**תאריך:** 19.07.2026
**סטטוס:** ממתין לאישור המשתמש

## הבעיה

כיום "השלמת מסמכים" היא חד-כיוונית ועיוורת:

1. המזכירות מסמנת מסמכים חסרים → הצאצא מקבל מייל → מעלה → הסטטוס חוזר אוטומטית
   ל"ממתין לאישור ראשוני" (`pending`). הצאצא שתיקן **נבלע** בין כל הנרשמים החדשים —
   אין שום דרך לדעת שחזר תיקון שצריך לבדוק.
2. אין שום דרך לבקש מהצאצא **לתקן את עץ הדורות שלו** (למשל כשנמצאה שגיאה בשרשרת),
   לא במודאל ולא בפורטל.

## החלטות שהתקבלו (עם המשתמש, 19.07.2026)

- מעבר לסטטוס "הוחזר תיקון" רק **כשהצאצא השלים את כל מה שנדרש** (כל המסמכים + תיקון
  דורות אם סומן) — לא אחרי כל פעולה חלקית.
- תיקון הדורות בפורטל הוא **עורך מלא**: הצאצא רואה את הערת המזכירות ואת השרשרת
  הנוכחית, ובונה מחדש את שרשרת הדורות באותו ממשק כמו בהרשמה. השרשרת הישנה נשמרת
  כ-snapshot להשוואה.

## גישות שנשקלו

- **א. הרחבת המודל הקיים (נבחרה):** ערך סטטוס חדש `docs_returned` + עמודות על
  `beneficiaries`. תואם את הדפוס הקיים (הכול סטטוס על הצאצא), מינימלי, בלי ג'וינים חדשים.
- **ב. טבלת `completion_requests` נפרדת** עם היסטוריית סבבים מלאה (בדוגמת
  `widow_requests`). חזק יותר לאודיט, אבל כבד: מסך חדש, ג'וינים, סנכרון סטטוס כפול.
  YAGNI — אם בעתיד יידרש תיעוד סבבים, אפשר להוסיף בלי לשבור את גישה א'.

## מודל הנתונים (מיגרציה — מריץ המשתמש ידנית, פרודקשן חי)

`supabase/migrations/20260719_docs_fix_cycle.sql`:

```sql
-- 1) ערך סטטוס חדש
alter table beneficiaries drop constraint if exists beneficiaries_eligibility_status_check;
alter table beneficiaries add constraint beneficiaries_eligibility_status_check
  check (eligibility_status in ('pending','approved','rejected','review','docs_pending','docs_returned'));

-- 2) שדות מעגל התיקון
alter table beneficiaries add column if not exists lineage_fix_required boolean not null default false;
alter table beneficiaries add column if not exists lineage_fix_note text;
alter table beneficiaries add column if not exists lineage_fixed_at timestamptz;
alter table beneficiaries add column if not exists lineage_chain_before_fix jsonb;
alter table beneficiaries add column if not exists docs_sent_at timestamptz;
alter table beneficiaries add column if not exists docs_returned_at timestamptz;
```

משמעות השדות:

| שדה | משמעות |
|---|---|
| `lineage_fix_required` | המזכירות סימנה שעץ הדורות לא תקין ודורש תיקון |
| `lineage_fix_note` | ההסבר לצאצא מה לא תקין בדורות |
| `lineage_fixed_at` | מתי הצאצא הגיש תיקון דורות (null = עוד לא) |
| `lineage_chain_before_fix` | ה-snapshot של השרשרת לפני התיקון (להשוואה במסך האדמין) |
| `docs_sent_at` | מתי נשלחה בקשת ההשלמה האחרונה |
| `docs_returned_at` | מתי הצאצא השלים את הכול והוחזר לבדיקה |

סטטוס חדש: `docs_returned` — תווית: **"הוחזר תיקון — לבדיקה"**.

## זרימה

```
מזכירות: מודאל "השלמת מסמכים"
  ├─ מסמכים חסרים (כמו היום) ו/או
  └─ ☑ "עץ הדורות דרוש תיקון" + הערה מה לא תקין
        ↓  status=docs_pending, docs_sent_at=now, איפוס lineage_fixed_at/docs_returned_at
מייל לצאצא (מורחב: כולל סעיף תיקון דורות אם סומן)
        ↓
פורטל: מסך "השלמת מסמכים" עם צ'קליסט דו-חלקי
  ├─ העלאת המסמכים שסומנו (כמו היום)
  └─ תיקון עץ הדורות: הערת המזכירות + השרשרת הנוכחית + עורך מלא (המבורר מההרשמה)
        ↓  בכל הגשה: בדיקת השלמה בצד שרת
כשהכול הושלם → status=docs_returned, docs_returned_at=now
        ↓
אדמין: כרטיס סינון חדש "הוחזרו תיקונים" ברשימת הצאצאים
  בדף הצאצא: באנר "מה חזר" — מסמכים שהועלו מאז docs_sent_at + השוואת שרשרת ישן/חדש
        ↓  המזכירות מחליטה:
  אישור יחוס / דחייה / סבב תיקון נוסף (docs_pending שוב) / החזר לממתין
```

## רכיבים ושינויים

### 1. אדמין — מודאל ההשלמה (`app/admin/beneficiaries/[id]/StatusControl.tsx`)

- מתחת לרשימת המסמכים: סקציית "עץ הדורות" — צ'קבוקס **"עץ הדורות דרוש תיקון"**;
  כשמסומן נפתחת textarea חובה "מה לא תקין בדורות (יוצג לצאצא)...".
- כפתור השליחה פעיל אם נבחר לפחות מסמך אחד **או** סומן תיקון דורות (היום: חובה מסמך).
- `applyStatus('docs_pending', ...)` שולח גם `lineage_fix_required`, `lineage_fix_note`,
  `docs_sent_at=now`, ומאפס `lineage_fixed_at`, `docs_returned_at`, `lineage_chain_before_fix`.
- יציאה מהמעגל (אישור/דחייה/החזר לממתין) מנקה את כל שדות המעגל.

### 2. מייל (`lib/emailTemplates.ts` — `docsPendingEmail`, `app/api/admin/send-status-email/route.ts`)

- פרמטר חדש: `lineageFixNote?: string`. כשקיים — סעיף במייל: "בנוסף, נמצא אי-דיוק
  בעץ הדורות שלך: <הערה>. בכניסה לאזור האישי תתבקש לתקן את שרשרת הדורות."
- הקישור נשאר `/?action=docs`.

### 3. פורטל (`app/page.tsx`)

- מסך `docs-needed` הופך לצ'קליסט דו-חלקי: חלק המסמכים (קיים) + חלק תיקון דורות
  (מוצג רק כש-`lineage_fix_required && !lineage_fixed_at`): הערת המזכירות, השרשרת
  הנוכחית, והמבורר המלא מההרשמה (בחירת אב קיים בעץ / הוספת שמות חדשים / בן־חתן) —
  שימוש חוזר באותם state ו-UI, עם prefill מהשרשרת הקיימת ככל האפשר.
- חלק שהושלם מוצג כ"✓ הושלם"; כשהכול הושלם — מסך "התיקון נשלח וממתין לבדיקת המשרד".
- בסטטוס `docs_returned` הפורטל מציג "התיקון התקבל וממתין לבדיקה" (נחשב pending-like
  לצורך הצגה; חסימות הפעולות של `docs_pending` מוסרות).
- מקרה קצה: כל המסמכים כבר קיימים במערכת ואין מה להעלות — הלקוח קורא ל-endpoint
  ההשלמה (סעיף 4ג) במקום לדלג על השרת (היום זה משאיר את הסטטוס תקוע).

### 4. API פורטל

- **א. `lib/docsReturnCheck.ts` (חדש):** `maybeMarkDocsReturned(admin, beneficiaryId)` —
  טוען את הצאצא; אם `docs_pending` וכל אחד מ-`required_docs` קיים ב-`documents`
  ו-(`!lineage_fix_required || lineage_fixed_at`) → מעדכן `docs_returned` +
  `docs_returned_at=now` + מנקה `required_docs`. בדיקות יחידה על הלוגיקה.
- **ב. `app/api/portal/fix-lineage/route.ts` (חדש):** אימות סשן פורטל (IDOR כמו
  upload-docs) + rate-limit. מקבל את השרשרת החדשה במבנה של ההרשמה
  (`lineage_node_id`, `lineage_chain`, `lineage_new_nodes`). פעם ראשונה — שומר
  snapshot ל-`lineage_chain_before_fix`. יוצר צמתים חדשים כ-`pending` (באותה לוגיקה
  של suggest-lineage/public-register), מעדכן `lineage_node_id`/`lineage_chain`/
  `lineage_manual`, קובע `lineage_fixed_at=now`, ואז מריץ את בדיקת ההשלמה (א).
- **ג. `app/api/portal/docs-complete/route.ts` (חדש):** מעטפת דקה על (א) למקרה
  שאין קבצים חדשים להעלות. אימות סשן + rate-limit.
- **ד. `app/api/portal/upload-docs/route.ts`:** במקום ההחזרה האוטומטית ל-`pending`
  (שורות 140-146) — קריאה ל-(א). לא מנקה `required_docs` לפני שההשלמה מלאה.

### 5. אדמין — רשימה ובדיקה

- `types/index.ts`: `docs_returned` ב-`EligibilityStatus` + תווית "הוחזר תיקון — לבדיקה".
- `app/admin/beneficiaries/page.tsx`: `docs_returned` ב-`STATUS_KEYS` (כרטיס ספירה).
- `BeneficiariesTable.tsx`: צ'יפ (צבע teal להבחנה מהכחול של docs_pending) + כרטיס סינון
  "הוחזרו תיקונים".
- `StatusControl.tsx`: סגנון לסטטוס החדש; האופציות הקיימות (אישור/דחייה/השלמת
  מסמכים/החזר לממתין) כבר מכסות את ההכרעה.
- **רכיב חדש `ReturnedFixesBanner`** בדף הצאצא (`[id]/page.tsx`), מוצג ב-`docs_returned`:
  - מסמכים שהועלו מאז `docs_sent_at` (שאילתת `documents.uploaded_at >= docs_sent_at`).
  - אם תוקנו דורות: השוואה שרשרת ישנה (`lineage_chain_before_fix`) מול חדשה
    (`lineage_chain`) עם הדגשת ההבדלים, וקישור לטאב עץ הדורות (הצמתים החדשים ממילא
    כתומים/pending בתצוגת הענף).
- סריקה גורפת של כל היקרויות `eligibility_status`/`docs_pending` בקוד (ייצוא, סוכן
  `lib/assistant/tools.ts`, `lib/lineageReliability.ts` STATUS_HE, פורטל) לעדכון עקבי.

### 6. טיפול בשגיאות ומקרי קצה

- סבב נוסף (docs_pending מתוך docs_returned): המודאל נפתח עם ההערות הקודמות ריקות;
  `docs_sent_at` מתחדש, כך שהבאנר בסבב הבא יציג רק מה שחזר בסבב האחרון.
- צאצא בלי `lineage_chain` (רישום ישן): עורך הדורות נפתח ריק כמו בהרשמה — עובד רגיל.
- הטריגר `sync_lineage_on_approval` והזרימה `approve-lineage` ממשיכים לעבוד: צמתים
  שנוצרו בתיקון הם `pending` ומאומתים באישור, כמו בהרשמה.
- אין שינוי בהרשאות: כל ה-API החדשים בפורטל מאובטחים בסשן pb_session + rate-limit;
  צד האדמין תחת ההרשאות הקיימות.

### 7. בדיקות

- יחידה: `lib/docsReturnCheck.test.ts` — כל צירופי (מסמכים חסרים/קיימים ×
  תיקון-דורות נדרש/לא/הוגש).
- יחידה: לוגיקת ה-diff של השוואת שרשראות (אם תופרד לפונקציה ב-lib).
- ידני: מעגל מלא בסביבת פיתוח — שליחה → מייל → פורטל (מסמכים + דורות) → docs_returned →
  באנר → אישור.

## מחוץ לתחולה (Out of scope)

- היסטוריית סבבי תיקון מלאה (טבלה ייעודית) — יתווסף רק אם יידרש.
- התראות/מייל למזכירות כשחוזר תיקון (אפשר להוסיף בהמשך; הכרטיס ברשימה נותן את המענה).
- עריכת דורות בפורטל שלא במסגרת בקשת תיקון מהמזכירות.
