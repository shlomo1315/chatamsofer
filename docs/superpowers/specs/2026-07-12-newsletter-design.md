# מערכת דיוור (ניוזלטר)

**תאריך:** 2026-07-12
**סטטוס:** מאושר לתכנון מימוש

---

## 1. מטרה

מערכת דיוור מלאה בתוך המערכת — ברמה של רב-מסר/Smoove — שמאפשרת לשלוח אלפי מיילים מותאמים אישית, לעקוב אחרי מי פתח ומה לחץ, ולנהל את כל המערך.

**היקף:** תוכנית Resend Pro — 50,000 מיילים בחודש.

**דרישות שהוגדרו:**
- תבניות מוכנות לעריכה
- בחירת קבוצות נמענים (סגמנטים)
- תזמון שליחה
- העלאת קבצים
- תצוגה מקדימה מלאה
- משתני מיזוג דינמיים — **גם בשורת הנושא וגם בגוף** ("לכבוד משה כהן")
- מעקב פתיחות וקליקים ברמת הנמען הבודד
- אפשרות לנמענים להשיב

---

## 2. ממצאי חקירת התשתית — מה חסר היום

חקירת הקוד גילתה חמישה פערים שחוסמים דיוור המוני. **כולם חייבים להיסגר לפני הפיצ'ר עצמו.**

| # | הפער | ההשלכה | התיקון |
|---|---|---|---|
| 1 | [lib/sendMail.ts:79](lib/sendMail.ts#L79) עושה `const { error } = await resend.emails.send(...)` — **זורק את `data.id`** | ה-webhook של Resend מזהה מיילים לפי המזהה הזה. בלעדיו **אין שום דרך לדעת מי פתח מה** | לתפוס את `data.id` ולכתוב ל-`sent_emails.resend_id` (העמודה כבר קיימת ותמיד `null`) |
| 2 | אין הגבלת קצב מול Resend | Resend מגביל **2 בקשות לשנייה**. לולאה של 2,000 מיילים תיחסם מיד | Batch API (100 בבקשה) + throttle |
| 3 | אין webhook לאירועי מסירה | אין `delivered`/`opened`/`clicked`/`bounced` | webhook חדש + טבלת `email_events` |
| 4 | `List-Unsubscribe: mailto:` בלבד ([sendMail.ts:89](lib/sendMail.ts#L89)) | **Gmail דורש One-Click unsubscribe משולחים מסיביים.** בלי זה — ספאם | One-Click + טבלת `unsubscribes` |
| 5 | דלי `documents` **פרטי** ([20260704_documents_bucket_private.sql](supabase/migrations/20260704_documents_bucket_private.sql)) | תמונות בניוזלטר **לא ייטענו** אצל הנמענים | דלי ציבורי חדש `public-assets` |

**על הקהל:** הטבלה היחידה עם כתובות מייל אמיתיות היא `beneficiaries`. **לצאצאים אין email** — הם רשומות JSON בתוך המוטב (`beneficiaries.children`). לכן "קהל צאצאים" מתורגם ל־**"מוטבים שיש להם ילד בטווח גילים X–Y"**. אין טבלת נדיבים/תורמים.

**גילוי מועיל:** `beneficiaries.past_benefits.update_topics: string[]` — *"נושאים שהמבקש ביקש לקבל עליהם עדכונים שוטפים"* ([types/index.ts:73](types/index.ts#L73)). זהו שדה הסכמה לדיוור שכבר נאסף מהמשתמשים. **נשתמש בו כמסנן.**

---

## 3. ארכיטקטורה — התור

זה הלב. הוא מה שמאפשר לשלוח אלפים בלי לאבד מייל אחד.

### 3.1 הזרימה

```
[לחיצה על "שלח"]
       ↓
1. מימוש הסגמנט (materialize)
   "כל אברכי הקהילה" → 1,247 שורות ב-campaign_recipients
   כל שורה עם סנאפשוט של המשתנים שלה (שם, עיר, פנייה...)
       ↓
2. סינון suppression + כתובות חסרות/לא תקינות
       ↓
3. campaign.status = 'sending'
       ↓
[Worker — כל דקה]
       ↓
4. שולף 100 שורות pending → מריץ merge tags → resend.batch.send()
   throttle: מקסימום 2 בקשות/שנייה
       ↓
5. שומר resend_id לכל נמען · status='sent'
   כישלון → 'failed' + retry (עד 3 פעמים)
       ↓
6. אין עוד pending → campaign.status = 'sent'
```

### 3.2 למה זה חסין

| תרחיש | מה קורה |
|---|---|
| השרת נופל באמצע שליחה | ה-worker עולה וממשיך מהשורות שנשארו `pending`. **אפס כפילויות, אפס אובדן.** |
| Railway מריץ 2 מכונות | `pg_try_advisory_lock` — רק מכונה אחת שולחת |
| מוטב נמחק תוך כדי | הסנאפשוט שמור בשורה — לא נשבר |
| Resend מחזיר שגיאה זמנית | retry אוטומטי עד 3 פעמים, אז `failed` (ורואים למה) |
| רוצים לעצור באמצע | `campaign.status='paused'` — ה-worker מדלג |

**קצב בפועל:** ~5,000 מיילים ב-10 דקות.

---

## 4. סכימת נתונים

**מיגרציה `20260724_newsletter.sql`:**

```sql
-- ── קמפיינים ──
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  subject       text not null,              -- תומך במשתני מיזוג
  preheader     text,
  from_department text not null default 'main',  -- מפתח מ-lib/departments.ts
  content       jsonb not null default '[]'::jsonb,  -- מערך בלוקים
  content_mode  text not null default 'blocks' check (content_mode in ('blocks','html')),
  raw_html      text,                       -- כש-content_mode='html'
  segment       jsonb not null default '{}'::jsonb,  -- הגדרת הקהל
  attachments   jsonb not null default '[]'::jsonb,
  status        text not null default 'draft'
                check (status in ('draft','scheduled','sending','paused','sent','cancelled','failed')),
  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  -- מונים (מתעדכנים ע"י trigger — לא נספרים מחדש בכל טעינת מסך)
  total_count   int not null default 0,
  sent_count    int not null default 0,
  failed_count  int not null default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── נמענים (התור) ──
create table if not exists public.campaign_recipients (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  email          text not null,
  merge_data     jsonb not null default '{}'::jsonb,  -- סנאפשוט המשתנים
  status         text not null default 'pending'
                 check (status in ('pending','sent','failed','skipped')),
  resend_id      text,                      -- ← המפתח לכל המעקב
  error          text,
  attempts       int not null default 0,
  sent_at        timestamptz,
  -- מעקב (מתעדכן מה-webhook)
  delivered_at   timestamptz,
  opened_at      timestamptz,
  open_count     int not null default 0,
  clicked_at     timestamptz,
  click_count    int not null default 0,
  bounced_at     timestamptz,
  complained_at  timestamptz
);

-- מונע כפילות מוחלטת: כתובת אחת פעם אחת בקמפיין
create unique index if not exists campaign_recipients_unique
  on public.campaign_recipients (campaign_id, email);

-- האינדקס שה-worker משתמש בו (partial — מהיר גם עם מיליון שורות)
create index if not exists campaign_recipients_queue
  on public.campaign_recipients (campaign_id) where status = 'pending';

create index if not exists campaign_recipients_resend
  on public.campaign_recipients (resend_id) where resend_id is not null;

-- ── אירועי מעקב (audit trail גולמי) ──
create table if not exists public.email_events (
  id           uuid primary key default gen_random_uuid(),
  resend_id    text not null,
  recipient_id uuid references public.campaign_recipients(id) on delete cascade,
  event_type   text not null,   -- delivered|opened|clicked|bounced|complained|delivery_delayed
  link_url     text,            -- ב-clicked: איזה קישור בדיוק
  user_agent   text,
  ip           text,
  raw          jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists email_events_resend    on public.email_events (resend_id);
create index if not exists email_events_recipient on public.email_events (recipient_id, created_at desc);

-- ── הסרה מרשימת תפוצה (suppression) ──
create table if not exists public.unsubscribes (
  email          text primary key,
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  reason         text,          -- 'user' | 'bounce' | 'complaint' | 'manual'
  campaign_id    uuid references public.campaigns(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── סגמנטים שמורים ──
create table if not exists public.segments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  definition jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ── רשימות חיצוניות (העלאה מ-Excel) ──
create table if not exists public.contact_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.contacts (
  id      uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  email   text not null,
  data    jsonb not null default '{}'::jsonb,  -- שדות נוספים למיזוג
  unique (list_id, email)
);

-- RLS: כל הטבלאות — is_staff() בלבד
-- (unsubscribes נגיש גם ל-service-role מהדף הציבורי)
```

---

## 5. משתני מיזוג

### 5.1 המשתנים

| משתנה | מקור | דוגמה |
|---|---|---|
| `{{פנייה}}` | `greetByStatus()` — **חכם** | *הרב כהן הי״ו* / *הרבנית לוי תחי׳* |
| `{{שם_משפחה}}` | `family_name` | כהן |
| `{{שם_פרטי}}` | `full_name` | משה |
| `{{שם_מלא}}` | שילוב | משה כהן |
| `{{עיר}}` | `city` | בני ברק |
| `{{מספר_ילדים}}` | `children_count` | 7 |
| `{{שנה_עברית}}` | `@hebcal/core` | תשפ״ו |
| `{{קישור_הסרה}}` | נוצר אוטומטית | (URL) |

**`{{פנייה}}` הוא הכי חשוב** — הוא משתמש בפונקציה שכבר קיימת ([lib/emailTemplates.ts:28](lib/emailTemplates.ts#L28)) ומבחין בין אברך לאלמנה. זה ההבדל בין מייל מכובד למייל מביך.

### 5.2 כללי מימוש

- **עובד גם בנושא וגם בגוף.** אותו מנוע.
- **נפילה חיננית:** לכל משתנה יש ברירת מחדל שאתה מגדיר. אם למישהו חסר שם — נכנס `"ידידנו היקר"`, **לא** `{{שם}}` ריק במייל.
- **הערכים נלקחים מהסנאפשוט** (`merge_data`), לא מה-DB בזמן השליחה. עקבי ובטוח.
- **Escaping מלא** של כל ערך לפני הזרקה ל-HTML.

---

## 6. עורך התוכן — בלוקים + HTML

### 6.1 למה בלוקים ולא WYSIWYG

עורכי WYSIWYG (Tiptap/Quill) מייצרים HTML מודרני עם `flexbox`/`grid`. **Outlook ו-Gmail לא תומכים בזה** — מייל שנראה מושלם אצלך מתפרק אצל חצי מהנמענים. זו הסיבה שכל מערכות הדיוור המקצועיות עובדות בבלוקים.

### 6.2 סוגי הבלוקים

| בלוק | תוכן |
|---|---|
| `heading` | כותרת (H1/H2), יישור |
| `text` | פסקה — עם bold/italic/link בסיסיים |
| `image` | תמונה + alt + קישור אופציונלי |
| `button` | טקסט + URL + צבע |
| `divider` | קו מפריד (זהב, כמו בשוברים) |
| `spacer` | רווח |
| `columns` | 2 עמודות |

**כל בלוק מרונדר ל-HTML של טבלאות** (`<table>`), עם `<style>` inline בלבד — הפורמט היחיד שעובד בכל תוכנות המייל.

### 6.3 המעטפת

התוכן נעטף ב-**`shell()` הקיים** ([lib/emailTemplates.ts:113](lib/emailTemplates.ts#L113)) — לוגו, RTL, פונט Heebo, accent bar, פוטר. **הניוזלטר נראה כמו חלק מהמערכת, לא כמו גוף זר.**

### 6.4 מצב HTML גולמי

כפתור "עבור ל-HTML" — תיבת קוד. אזהרה חד-פעמית שהמעבר בכיוון הזה **הוא חד-כיווני** (אי אפשר לחזור לבלוקים).

**Sanitization:** [lib/sanitizeEmailHtml.ts](lib/sanitizeEmailHtml.ts) הקיים חוסם `<style>` — מה שישבור HTML של מייל. נצטרך **פרופיל sanitize נפרד לניוזלטר** שמתיר `<style>` ו-`<table>` אבל חוסם `<script>`/`<iframe>`/`on*`.

---

## 7. בונה הקהל (Segment Builder)

### 7.1 מקורות

- **מוטבים** (`beneficiaries`) — המקור העיקרי
- **צוות** (`profiles`)
- **בתי החלמה** (`recovery_homes.report_email`)
- **רשימה חיצונית** (`contact_lists`) — העלאת CSV/Excel

### 7.2 מסננים (מוטבים)

| מסנן | שדה |
|---|---|
| סטטוס זכאות | `eligibility_status` |
| פעיל | `is_active` |
| שיוך קהילתי | `community_affiliation` ⚠️ |
| עיר | `city` |
| מצב משפחתי | `marital_status` |
| מין | `gender` |
| מספר ילדים | `children_count` (טווח) |
| **יש ילד בגיל X–Y** | חישוב מ-`children` JSON |
| נושאי עדכון שביקש | `past_benefits.update_topics` |
| יש הלוואה פעילה | join ל-`loans` |
| קיבל עזר יולדות | join ל-`maternity_aids` |
| ענף בעץ היוחסין | `lineage_chain` |

⚠️ **`community_affiliation` הוא טקסט חופשי**, לא רשימה סגורה. המסנן יציג את **הערכים הקיימים בפועל** (`select distinct`) ויעבוד ב-`ILIKE`, אחרת "בני ברק" ו-"ב״ב" ייחשבו שונים.

### 7.3 חוויה

- מונה חי: **"1,247 נמענים"** מתעדכן בכל שינוי מסנן
- **"1,203 עם כתובת מייל · 44 ללא"** — שקיפות מלאה
- **"12 מוסרו מרשימת התפוצה — לא ייכללו"**
- כפתור **"שמור כסגמנט"**

---

## 8. מעקב

### 8.1 המנגנון

`tracking: { open: true, click: true }` בקריאה ל-Resend. Resend מזריק פיקסל ועוטף קישורים, ושולח webhook על כל אירוע ל-`/api/webhooks/resend-events`.

**אימות ה-webhook:** Resend חותם עם **Svix**. נאמת חתימה (`svix-id`, `svix-timestamp`, `svix-signature`) מול `RESEND_WEBHOOK_SIGNING_SECRET`. **fail-closed** — בלי סוד, הכל נדחה. זה חשוב: בלי אימות, כל אחד יכול לזייף "1,000 פתיחות".

**עיבוד:** התאמה לפי `resend_id` → עדכון `campaign_recipients` + רישום ב-`email_events`.

### 8.2 טיפול אוטומטי ב-bounce ותלונות

| אירוע | פעולה |
|---|---|
| `bounced` (hard) | הוספה אוטומטית ל-`unsubscribes` (reason: `bounce`) |
| `complained` (סימון כספאם) | הוספה אוטומטית ל-`unsubscribes` (reason: `complaint`) |

**זה קריטי לבריאות הדומיין.** שליחה חוזרת לכתובת שנכשלה או למי שסימן ספאם — הורסת את המוניטין שלך מול Gmail ומעבירה את *כל* המיילים שלך לספאם, כולל האוטומטיים.

### 8.3 מסך הקמפיין

**כרטיסי מדדים:** נשלח · נמסר · **נפתח (%)** · **הוקלק (%)** · נכשל · הוסר · תגובות.

**טבלת נמענים:** כל נמען + סטטוס + מתי פתח + כמה קליקים. סינון לפי סטטוס.

**טאב קליקים:** איזה קישור נלחץ, כמה פעמים, ומי לחץ.

**גרף** (`recharts`, כבר בפרויקט): פתיחות לאורך זמן.

### 8.4 הערת אמת על אחוזי פתיחה

Gmail ו-Apple Mail Privacy Protection **חוסמים חלקית את פיקסל הפתיחה**. אחוזי הפתיחה תמיד **נמוכים מהמציאות**. **קליקים מדויקים ב-100%.**

זה יופיע כהערה במסך עצמו, כדי שלא תסיק מסקנות שגויות.

---

## 9. הסרה מרשימת תפוצה

**זו לא תוספת — זו דרישה חוקית ותנאי טכני.**

- **חוק התקשורת (תיקון 40)** — דיוור פרסומי חייב לאפשר הסרה
- **Gmail Bulk Sender Requirements** — מחייב **One-Click** (`List-Unsubscribe-Post`)

**המימוש:**
1. כותרות: `List-Unsubscribe: <https://.../api/unsubscribe/<token>>, <mailto:...>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
2. קישור "הסרה מרשימת התפוצה" בפוטר של כל ניוזלטר
3. דף `/unsubscribe/<token>` — אישור בלחיצה אחת
4. **סינון בזמן המימוש** — מי שברשימה **לעולם לא ייכנס** לקמפיין. לא ניתן לעקוף.

**חשוב — הפרדה:** ההסרה חלה על **דיוור בלבד**. מיילים תפעוליים (אישור לידה, שובר, סקר) **ממשיכים להישלח** — הם לא פרסומת, הם שירות שהמוטב ביקש.

---

## 10. תגובות

הנמענים לוחצים Reply → Resend Inbound → `inbound_emails` (**המנגנון כבר קיים**).

**קישור לקמפיין:** `Reply-To` עם plus-addressing — `office+c<campaignId>@chasamsofer.info`. ה-webhook הקיים ([app/api/webhooks/resend-inbound/route.ts](app/api/webhooks/resend-inbound/route.ts)) מקבל הרחבה שמזהה את התבנית.

כרטיס הקמפיין מציג **"14 תגובות"** → לחיצה פותחת אותן.

---

## 11. אבטחה

| נושא | פתרון |
|---|---|
| הרשאות | `requirePermission('newsletter', 'edit')` — `SectionKey` חדש |
| webhook | אימות חתימת **Svix** · fail-closed |
| טוקן הסרה | HMAC-SHA256 — לא ניתן לנחש ולהסיר מישהו אחר |
| XSS ב-HTML גולמי | DOMPurify עם פרופיל ניוזלטר |
| SSRF בקישורים | ולידציה — `http(s)` בלבד |
| **הגנה משליחה בשוגג** | **פופ-אפ אישור עם מספר הנמענים המדויק.** "עומד להישלח ל-**1,247** נמענים." + הקלדת המספר לאישור מעל 500 נמענים |
| שבת/חג | תזמון לשבת → אזהרה + הצעת יום חול. משתמש ב-`lib/jewishCalendar.ts` מה-spec המקביל |

---

## 12. קבצים

### מיגרציות (2)
- `20260724_newsletter.sql` — כל הטבלאות
- `20260725_public_assets_bucket.sql` — דלי ציבורי לתמונות

### תיקוני תשתית (2) — **קודמים לכל השאר**
- `lib/sendMail.ts` — שמירת `resend_id` + One-Click unsubscribe
- `lib/sanitizeEmailHtml.ts` — פרופיל ניוזלטר

### Lib (6)
| קובץ | תפקיד |
|---|---|
| `lib/newsletter/blocks.ts` | הגדרת בלוקים + רינדור ל-HTML |
| `lib/newsletter/merge.ts` | מנוע משתני מיזוג |
| `lib/newsletter/segments.ts` | בניית שאילתת הקהל |
| `lib/newsletter/sender.ts` | **ה-worker** — batch + throttle + retry |
| `lib/newsletter/tracking.ts` | עיבוד webhook |
| `lib/unsubscribe.ts` | טוקנים + suppression |

### API (8)
- `app/api/admin/campaigns/route.ts` — CRUD
- `app/api/admin/campaigns/[id]/route.ts`
- `app/api/admin/campaigns/[id]/send/route.ts` — מימוש + הפעלה
- `app/api/admin/campaigns/[id]/pause/route.ts`
- `app/api/admin/campaigns/[id]/test/route.ts` — מייל בדיקה
- `app/api/admin/segments/preview/route.ts` — מונה + תצוגה
- `app/api/webhooks/resend-events/route.ts` — **חדש**
- `app/api/unsubscribe/[token]/route.ts` — GET + POST (One-Click)

### UI (10)
- `app/admin/newsletter/page.tsx` — רשימת קמפיינים
- `app/admin/newsletter/[id]/page.tsx` — Wizard 4 שלבים
- `app/admin/newsletter/[id]/stats/page.tsx` — סטטיסטיקות
- `components/newsletter/` — `SegmentBuilder` · `BlockEditor` · `BlockRenderer` · `MergeTagPicker` · `EmailPreview` · `SendConfirm` · `CampaignStats`

### נגיעות
- `instrumentation.ts` — worker
- `components/layout/Sidebar.tsx` — לשונית "ניוזלטר"
- `types/index.ts` — `SectionKey: 'newsletter'`
- `app/api/webhooks/resend-inbound/route.ts` — זיהוי תגובות

---

## 13. סדר בנייה

**חובה בסדר הזה** — כל שלב נשען על הקודם:

| # | שלב | תוצר |
|---|---|---|
| **1** | **תיקוני תשתית** | `resend_id` נשמר · One-Click · דלי ציבורי |
| **2** | **סכימה** | 2 מיגרציות |
| **3** | **מנוע השליחה** | worker + merge + batch. **בדיקה: קמפיין ל-3 נמענים** |
| **4** | **מעקב** | webhook + Svix. **בדיקה: פתיחה אמיתית מגיעה ל-DB** |
| **5** | **סגמנטים** | בונה קהל + מונה חי |
| **6** | **עורך** | בלוקים + HTML + תצוגה מקדימה |
| **7** | **Wizard + סטטיסטיקות** | המסכים |
| **8** | **תגובות + unsubscribe UI** | סגירת המעגל |

**נקודת בדיקה קריטית אחרי שלב 4:** קמפיין אמיתי ל-10 נמענים פנימיים. אם המעקב לא עובד שם — אין טעם להמשיך.

---

## 14. בדיקות

**קריטי:**
- **`lib/newsletter/merge.ts`** — משתנה חסר, ערך `null`, תווים מיוחדים, ניסיון XSS דרך שם
- **`lib/newsletter/sender.ts`** — retry, batch חלקי שנכשל, **התאוששות מקריסה** (הרג התהליך באמצע → אימות שאין כפילויות)
- **suppression** — מוטב שהוסר **חייב** להיעדר מהמימוש
- **`resend_id`** — אימות שהוא נשמר. **בלעדיו הכל מת.**

**End-to-end:** יצירת קמפיין → סגמנט → תוכן → תצוגה מקדימה → מייל בדיקה → שליחה ל-10 → אימות שכולם קיבלו → פתיחה + קליק אמיתיים → אימות שהאירועים הגיעו ל-DB ומוצגים במסך.

**עומס:** מימוש סגמנט של 5,000 → מדידת זמן. ה-worker חייב לסיים ב-≤15 דקות בלי לחטוף rate-limit.

---

## 15. מודע ומחוץ לסקופ

- **A/B testing** — לא בגרסה זו
- **דוחות מתקדמים** (heatmap, שעות אופטימליות) — לא
- **Resend Audiences/Broadcasts** — **נדחה במודע.** ה-personalization שלהם מוגבל ל-`{{{FIRST_NAME}}}` והרשימות מנוהלות אצלם — כלומר "כל היולדות שאושרו החודש" בלתי אפשרי
- **דיוור SMS** — לא
- **`community_affiliation` לא מנורמל** — טקסט חופשי. המסנן יעבוד ב-`ILIKE` על ערכים קיימים. נורמליזציה = פרויקט נפרד
- **מיילים תפעוליים לא מושפעים** — `deliverMail` ממשיך לעבוד בדיוק כמו היום. הניוזלטר הוא שכבה **מעליו**, לא במקומו
