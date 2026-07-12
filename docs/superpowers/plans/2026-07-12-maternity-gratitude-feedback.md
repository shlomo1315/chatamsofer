# מכתבי ברכה + משוב בית החלמה — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מייל אוטומטי 10 ימים אחרי אישור לידה עם בקשה למכתב ברכה לנדיב (3 מסלולי מענה), ומייל משוב 5 ימים אחרי סימון הגעה לבית החלמה — שניהם עם חסימה מוחלטת של שבת וחג.

**Architecture:** תשתית `scheduled_emails` גנרית + worker שעתי ב-`instrumentation.ts`. חסימת שבת/חג ב-`lib/jewishCalendar.ts` (`@hebcal/core`, כבר מותקן). שובר PDF ב-`pdf-lib` עם עוזרים משותפים שמחולצים מ-`lib/maternityVoucher.ts` ל-`lib/voucherKit.ts`. גישה ציבורית דרך טוקן HMAC חתום + service-role, לפי הדפוס הקיים ב-`lib/portalSession.ts`.

**Tech Stack:** Next.js 16 (App Router) · Supabase (Postgres + Storage) · Resend · pdf-lib + fontkit · @hebcal/core · vitest (מותקן במשימה 0)

**Spec:** [docs/superpowers/specs/2026-07-12-maternity-gratitude-survey-design.md](../specs/2026-07-12-maternity-gratitude-survey-design.md)

---

## Global Constraints

- **שפה מול היולדת: אסור להשתמש במילה "סקר".** בכל טקסט שהיולדת רואה (מיילים, דפים ציבוריים, כפתורים) הניסוח הוא: *"לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת בבית ההחלמה"*. שמות טכניים בקוד/DB/אדמין (`survey_responses`, `recovery_survey`) נשארים כפי שהם.
- **פרודקשן חי.** אסור לשבור זרימות קיימות. כל שינוי ב-`lib/maternityVoucher.ts` ו-`lib/sendMail.ts` חייב להיות ללא שינוי התנהגות.
- **RTL בעברית** בכל UI. Tailwind 4, `lucide-react`, `components/ui/*`.
- **מיגרציות:** `supabase/migrations/YYYYMMDD_slug.sql`, **אידמפוטנטיות** (`if not exists`, `drop policy if exists`), מורצות ידנית ע"י המשתמש ב-Supabase SQL Editor.
- **RLS:** כל טבלה חדשה — `enable row level security` + policy `is_staff()`. גישה ציבורית **רק** דרך service-role ב-API route.
- **אין `console.log` של מידע אישי.**
- **כל endpoint ציבורי:** `rateLimit()` + אימות טוקן + `export const dynamic = 'force-dynamic'`.
- אחרי כל משימה: `npx tsc --noEmit` חייב לעבור.

---

## File Structure

**קבצים חדשים:**
| קובץ | אחריות |
|---|---|
| `lib/jewishCalendar.ts` | חסימת שבת/חג — `isBlockedForMail`, `nextAllowedSendTime` |
| `lib/jewishCalendar.test.ts` | בדיקות (קריטי) |
| `lib/scheduledMail.ts` | `scheduleEmail`, `cancelScheduledEmail`, `runScheduledMail` |
| `lib/voucherKit.ts` | עוזרי PDF משותפים (מחולץ מ-`maternityVoucher.ts`) |
| `lib/gratitudeVoucher.ts` | שובר הברכה — `blank` / `filled` |
| `lib/surveyParse.ts` | פרסור תשובות מספריות ממייל |
| `lib/surveyParse.test.ts` | בדיקות (קריטי) |
| `lib/publicToken.ts` | טוקן HMAC לקישורים ציבוריים |

**מיגרציות:** `20260722_scheduled_emails.sql` · `20260723_gratitude_and_feedback.sql`

**קבצים בשינוי:** `lib/maternityVoucher.ts` (ייבוא מ-voucherKit) · `lib/emailTemplates.ts` (+3 תבניות) · `instrumentation.ts` (+worker) · `app/api/admin/request-approved/route.ts` (+תזמון) · `app/api/portal/arrived/route.ts` (+תזמון/ביטול) · `app/api/webhooks/resend-inbound/route.ts` (+ניתוב) · `components/layout/Sidebar.tsx` · `types/index.ts`

---

## Task 0: תשתית בדיקות (vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` — מריץ vitest

- [ ] **Step 1: התקנת vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: יצירת `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 3: הוספת script ל-`package.json`**

בתוך `"scripts"`, אחרי `"lint": "eslint"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: אימות**

Run: `npm test`
Expected: `No test files found` — יוצא בקוד 0 או 1, אבל **בלי שגיאת קונפיגורציה**.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: הוספת vitest לבדיקות לוגיקה קריטית"
```

---

## Task 1: `lib/jewishCalendar.ts` — חסימת שבת וחג

**זו המשימה הקריטית ביותר בתוכנית.** אם היא שגויה — יוצאים מיילים בשבת.

**Files:**
- Create: `lib/jewishCalendar.ts`
- Test: `lib/jewishCalendar.test.ts`

**Interfaces:**
- Produces:
  - `isBlockedForMail(when: Date): boolean`
  - `nextAllowedSendTime(desired: Date): Date`
  - `addDays(d: Date, n: number): Date`

- [ ] **Step 1: כתיבת הבדיקות (נכשלות)**

צור `lib/jewishCalendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isBlockedForMail, nextAllowedSendTime, addDays } from './jewishCalendar'

// עוזר: בונה Date בשעון ישראל (UTC+3 בקיץ, UTC+2 בחורף).
// משתמשים ב-ISO עם offset מפורש כדי שהבדיקה לא תהיה תלויה בשעון המכונה.
const il = (iso: string) => new Date(iso)

describe('isBlockedForMail', () => {
  it('חוסם שבת', () => {
    // שבת, 11 ביולי 2026, 10:00 שעון ישראל
    expect(isBlockedForMail(il('2026-07-11T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם ערב שבת מ-14:00', () => {
    // שישי, 10 ביולי 2026, 15:00
    expect(isBlockedForMail(il('2026-07-10T15:00:00+03:00'))).toBe(true)
  })

  it('מתיר ערב שבת בבוקר', () => {
    // שישי, 10 ביולי 2026, 09:00
    expect(isBlockedForMail(il('2026-07-10T09:00:00+03:00'))).toBe(false)
  })

  it('מתיר יום חול רגיל', () => {
    // רביעי, 8 ביולי 2026, 09:00
    expect(isBlockedForMail(il('2026-07-08T09:00:00+03:00'))).toBe(false)
  })

  it('חוסם יום כיפור', () => {
    // יום כיפור תשפ"ז — 21 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-21T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם ראש השנה', () => {
    // ר"ה תשפ"ז — 12-13 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-12T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם יום א של סוכות', () => {
    // סוכות תשפ"ז — 26 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-26T10:00:00+03:00'))).toBe(true)
  })

  it('מתיר חול המועד סוכות', () => {
    // חוה"מ סוכות תשפ"ז — 29 בספטמבר 2026 (יום עבודה בישראל)
    expect(isBlockedForMail(il('2026-09-29T09:00:00+03:00'))).toBe(false)
  })

  it('מתיר חנוכה', () => {
    // חנוכה תשפ"ז — 5 בדצמבר 2026 (לא יו"ט)
    expect(isBlockedForMail(il('2026-12-06T09:00:00+03:00'))).toBe(false)
  })
})

describe('nextAllowedSendTime', () => {
  it('מזיז שבת ליום ראשון 09:00', () => {
    const out = nextAllowedSendTime(il('2026-07-11T10:00:00+03:00'))
    // יום ראשון 12 ביולי, 09:00 שעון ישראל
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false,
    }).formatToParts(out)
    const g = Object.fromEntries(parts.map(p => [p.type, p.value]))
    expect(`${g.year}-${g.month}-${g.day}`).toBe('2026-07-12')
    expect(Number(g.hour)).toBe(9)
  })

  it('לא נוגע בתאריך שכבר מותר', () => {
    const d = il('2026-07-08T09:00:00+03:00')
    expect(nextAllowedSendTime(d).getTime()).toBe(d.getTime())
  })

  it('מזיז ערב שבת אחה"צ ליום ראשון', () => {
    const out = nextAllowedSendTime(il('2026-07-10T16:00:00+03:00'))
    const g = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(out).map(p => [p.type, p.value]))
    expect(`${g.year}-${g.month}-${g.day}`).toBe('2026-07-12')
  })

  it('תמיד מחזיר תאריך שאינו חסום', () => {
    // 400 תאריכים רצופים — אף אחד מהפלטים לא יכול להיות חסום
    for (let i = 0; i < 400; i++) {
      const input = addDays(il('2026-01-01T12:00:00+02:00'), i)
      expect(isBlockedForMail(nextAllowedSendTime(input))).toBe(false)
    }
  })
})
```

- [ ] **Step 2: הרצה — אימות כישלון**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./jewishCalendar"`

- [ ] **Step 3: המימוש**

צור `lib/jewishCalendar.ts`:

```ts
import { HDate, HebrewCalendar, flags } from '@hebcal/core'

// ─────────────────────────────────────────────────────────────────────────────
// חסימת שליחת מיילים בשבת ובחג.
//
// הכלל: אסור לשלוח מייל בשבת, ביום טוב, או בערב שבת/חג מ-14:00 והלאה.
// חול המועד מותר (יום עבודה בפועל בישראל), וכך גם חנוכה/פורים/ר"ח.
//
// הערת מימוש: החסימה מ-14:00 היא שמרנית בכוונה — היא מוקדמת מזמן הדלקת
// הנרות בכל עונה ובכל מקום בארץ, ולכן תמיד בטוחה ואינה תלויה במיקום.
// ─────────────────────────────────────────────────────────────────────────────

const EVE_CUTOFF_HOUR = 14   // מ-14:00 בערב שבת/חג — חסום
const SEND_HOUR = 9          // שעת השליחה ביום המותר הבא
const MAX_LOOKAHEAD_DAYS = 14 // תקרת בטיחות (רצף החגים הארוך ביותר קצר מזה)

// פירוק תאריך לפי שעון ישראל — עמיד לשעון קיץ/חורף.
// (אותו דפוס כמו israelParts() ב-instrumentation.ts)
function israelParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]))
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    weekday: p.weekday as string,   // 'Sat', 'Fri', ...
  }
}

// האם התאריך (יום קלנדרי) הוא יום טוב — כלומר יום שאסור בו במלאכה.
// מסננים החוצה: חגים מודרניים (יום העצמאות), חול המועד, ראש חודש, חנוכה,
// פורים, ימי צום — כולם ימי עבודה רגילים בישראל.
function isYomTov(year: number, month: number, day: number): boolean {
  try {
    const hd = new HDate(new Date(year, month - 1, day))
    const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? []  // true = ארץ ישראל
    return events.some(ev => {
      const f = ev.getFlags()
      if (f & flags.MODERN_HOLIDAY) return false
      if (f & flags.CHOL_HAMOED) return false
      if (f & flags.ROSH_CHODESH) return false
      if (f & flags.MINOR_FAST) return false
      if (f & flags.MAJOR_FAST) return false   // ט' באב/יוה"כ נתפסים ב-CHAG ממילא
      return Boolean(f & flags.CHAG)
    })
  } catch {
    // אם hebcal נכשל — נוקטים בצד הבטוח ומחשיבים כיום טוב (לא שולחים)
    return true
  }
}

// האם המחרת (לפי הלוח) הוא שבת או יום טוב — כלומר היום הנוכחי הוא ערב.
function isEveOfRest(year: number, month: number, day: number): boolean {
  const next = new Date(year, month - 1, day + 1)   // Date מנרמל גלישת חודש
  const ny = next.getFullYear(), nm = next.getMonth() + 1, nd = next.getDate()
  const isSaturday = next.getDay() === 6
  return isSaturday || isYomTov(ny, nm, nd)
}

/** האם אסור לשלוח מייל בנקודת הזמן הזו. */
export function isBlockedForMail(when: Date): boolean {
  const { year, month, day, hour, weekday } = israelParts(when)

  // שבת
  if (weekday === 'Sat') return true

  // יום טוב
  if (isYomTov(year, month, day)) return true

  // ערב שבת/חג מ-14:00
  if (hour >= EVE_CUTOFF_HOUR && isEveOfRest(year, month, day)) return true

  return false
}

/**
 * מחזיר את מועד השליחה החוקי הקרוב ביותר.
 * אם המועד המבוקש מותר — מוחזר כמות שהוא.
 * אחרת — נדחה ליום המותר הבא, בשעה 09:00 שעון ישראל.
 */
export function nextAllowedSendTime(desired: Date): Date {
  if (!isBlockedForMail(desired)) return desired

  for (let i = 1; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const candidate = atIsraelHour(addDays(desired, i), SEND_HOUR)
    if (!isBlockedForMail(candidate)) return candidate
  }
  // בלתי אפשרי בלוח העברי (אין 14 ימי מנוחה רצופים), אבל לא נשאיר לולאה פתוחה
  return atIsraelHour(addDays(desired, MAX_LOOKAHEAD_DAYS), SEND_HOUR)
}

/** מוסיף ימים לתאריך (ללא שינוי המקור). */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + n)
  return out
}

// קובע את השעה לפי שעון ישראל, תוך שמירה על היום הקלנדרי הישראלי.
// מחשבים את היסט האזור באותו רגע ומתקנים בהתאם — כך זה נכון גם בשעון קיץ.
function atIsraelHour(d: Date, hour: number): Date {
  const { hour: currentHour } = israelParts(d)
  const deltaHours = hour - currentHour
  const out = new Date(d.getTime() + deltaHours * 3600_000)
  // מאפסים דקות/שניות ביחס לשעון ישראל
  out.setMinutes(0, 0, 0)
  return out
}
```

- [ ] **Step 4: הרצה — אימות מעבר**

Run: `npm test`
Expected: **PASS — כל 13 הבדיקות.**

אם `atIsraelHour` נכשל בבדיקת השעה — התיקון הוא לחשב מחדש אחרי `setMinutes` (הזזת השעה עשויה לחצות גבול DST). במקרה כזה, עטוף בלולאת תיקון של עד 2 איטרציות שמאמתת ש-`israelParts(out).hour === hour`.

- [ ] **Step 5: Commit**

```bash
git add lib/jewishCalendar.ts lib/jewishCalendar.test.ts
git commit -m "feat: חסימת שליחת מיילים בשבת ובחג (@hebcal/core)"
```

---

## Task 2: מיגרציית `scheduled_emails`

**Files:**
- Create: `supabase/migrations/20260722_scheduled_emails.sql`

**Interfaces:**
- Produces: טבלת `scheduled_emails` — נצרכת ע"י Task 3

- [ ] **Step 1: כתיבת המיגרציה**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- תור מיילים מתוזמנים (גנרי).
-- כל פיצ'ר שצריך "שלח מייל בעוד N ימים" רושם כאן שורה, ו-worker אחד
-- (lib/scheduledMail.ts, נקרא מ-instrumentation.ts) שולח כשהגיע הזמן.
-- מועד השליחה כבר מותאם לשבת/חג בעת הקביעה (lib/jewishCalendar.ts).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.scheduled_emails (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,             -- 'gratitude_letter' | 'recovery_survey'
  entity_table text not null,             -- 'maternity_aids'
  entity_id    uuid not null,
  to_email     text not null,
  send_after   timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending','sent','cancelled','failed')),
  attempts     int  not null default 0,
  last_error   text,
  payload      jsonb not null default '{}'::jsonb,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ההגנה המרכזית מפני שליחה כפולה: מייל אחד מכל סוג לכל ישות.
create unique index if not exists scheduled_emails_unique
  on public.scheduled_emails (kind, entity_table, entity_id);

-- האינדקס שה-worker משתמש בו
create index if not exists scheduled_emails_due
  on public.scheduled_emails (send_after) where status = 'pending';

alter table public.scheduled_emails enable row level security;
-- ללא policies: גישה דרך service-role בלבד (עקבי עם app_settings)
```

- [ ] **Step 2: המשתמש מריץ ב-Supabase SQL Editor**

⚠️ **עצור כאן והצג למשתמש את ה-SQL להרצה.** אין הרצה אוטומטית — המשתמש מריץ ידנית.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260722_scheduled_emails.sql
git commit -m "feat: טבלת scheduled_emails — תור מיילים מתוזמנים"
```

---

## Task 3: `lib/scheduledMail.ts` — התור וה-worker

**Files:**
- Create: `lib/scheduledMail.ts`
- Modify: `instrumentation.ts`

**Interfaces:**
- Consumes: `isBlockedForMail`, `nextAllowedSendTime` (Task 1)
- Produces:
  - `scheduleEmail(input: ScheduleInput): Promise<void>`
  - `cancelScheduledEmail(key: EntityKey): Promise<void>`
  - `runScheduledMail(): Promise<{ sent: number; failed: number; skipped: number }>`
  - `type ScheduledKind = 'gratitude_letter' | 'recovery_survey'`

- [ ] **Step 1: יצירת `lib/scheduledMail.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isBlockedForMail, nextAllowedSendTime } from './jewishCalendar'

export type ScheduledKind = 'gratitude_letter' | 'recovery_survey'

export interface EntityKey {
  kind: ScheduledKind
  entityTable: string
  entityId: string
}

export interface ScheduleInput extends EntityKey {
  toEmail: string | null | undefined
  sendAfter: Date
  payload?: Record<string, unknown>
}

const MAX_ATTEMPTS = 3
const BATCH_SIZE = 50
const LOCK_KEY = 918273645   // מזהה שרירותי ל-advisory lock של ה-worker הזה

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * מתזמן מייל. אם כבר קיים מייל מאותו סוג לאותה ישות:
 *  • 'sent'      — לא נוגעים (לא שולחים פעמיים)
 *  • 'cancelled' — מוחזר ל-'pending' עם מועד חדש
 *  • 'pending'   — מעדכנים את המועד
 * מוטב ללא כתובת מייל — דילוג שקט (לא זורק, כדי לא לשבור זרימה קיימת).
 */
export async function scheduleEmail(input: ScheduleInput): Promise<void> {
  const email = (input.toEmail ?? '').trim()
  if (!email || !email.includes('@')) {
    console.warn(`[scheduled-mail] דילוג — אין כתובת מייל (${input.kind}/${input.entityId})`)
    return
  }
  const db = admin()
  if (!db) { console.error('[scheduled-mail] אין service-role client'); return }

  const sendAfter = nextAllowedSendTime(input.sendAfter)

  // לא דורסים מייל שכבר נשלח
  const { data: existing } = await db
    .from('scheduled_emails')
    .select('id, status')
    .eq('kind', input.kind)
    .eq('entity_table', input.entityTable)
    .eq('entity_id', input.entityId)
    .maybeSingle()

  if (existing?.status === 'sent') return

  const row = {
    kind: input.kind,
    entity_table: input.entityTable,
    entity_id: input.entityId,
    to_email: email,
    send_after: sendAfter.toISOString(),
    status: 'pending',
    attempts: 0,
    last_error: null,
    payload: input.payload ?? {},
    updated_at: new Date().toISOString(),
  }

  const { error } = await db
    .from('scheduled_emails')
    .upsert(row, { onConflict: 'kind,entity_table,entity_id' })
  if (error) console.error('[scheduled-mail] scheduleEmail:', error.message)
}

/** מבטל מייל שטרם נשלח. מייל שכבר נשלח — לא מושפע. */
export async function cancelScheduledEmail(key: EntityKey): Promise<void> {
  const db = admin()
  if (!db) return
  const { error } = await db
    .from('scheduled_emails')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('kind', key.kind)
    .eq('entity_table', key.entityTable)
    .eq('entity_id', key.entityId)
    .eq('status', 'pending')
  if (error) console.error('[scheduled-mail] cancel:', error.message)
}

/**
 * ה-worker. נקרא כל שעה מ-instrumentation.ts.
 * מוגן ב-advisory lock — אם Railway מריץ שתי מכונות, רק אחת שולחת.
 */
export async function runScheduledMail(): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = admin()
  if (!db) return { sent: 0, failed: 0, skipped: 0 }

  // בטיחות עליונה: לעולם לא שולחים בשבת/חג, גם אם השרת היה למטה
  // והתעורר בזמן אסור.
  if (isBlockedForMail(new Date())) {
    return { sent: 0, failed: 0, skipped: 0 }
  }

  const { data: gotLock } = await db.rpc('pg_try_advisory_lock', { key: LOCK_KEY })
  if (gotLock === false) return { sent: 0, failed: 0, skipped: 0 }

  let sent = 0, failed = 0, skipped = 0
  try {
    const { data: due } = await db
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('send_after', new Date().toISOString())
      .limit(BATCH_SIZE)

    for (const job of due ?? []) {
      try {
        const { sendScheduled } = await import('./scheduledMailSenders')
        const result = await sendScheduled(db, job)

        if (result.outcome === 'sent') {
          await db.from('scheduled_emails').update({
            status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', job.id)
          sent++
        } else if (result.outcome === 'cancelled') {
          // הישות כבר לא רלוונטית (לידה בוטלה / סימון הגעה בוטל)
          await db.from('scheduled_emails').update({
            status: 'cancelled', last_error: result.reason ?? null, updated_at: new Date().toISOString(),
          }).eq('id', job.id)
          skipped++
        } else {
          throw new Error(result.reason ?? 'שליחה נכשלה')
        }
      } catch (err) {
        const attempts = (job.attempts ?? 0) + 1
        await db.from('scheduled_emails').update({
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          last_error: String(err instanceof Error ? err.message : err).slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        failed++
      }
    }
  } finally {
    await db.rpc('pg_advisory_unlock', { key: LOCK_KEY })
  }

  return { sent, failed, skipped }
}
```

- [ ] **Step 2: RPC ל-advisory lock**

Supabase לא חושף `pg_try_advisory_lock` דרך REST כברירת מחדל. הוסף למיגרציה `20260722_scheduled_emails.sql` (בסוף הקובץ):

```sql
-- עטיפות ל-advisory lock, כדי שה-worker יוכל לקרוא להן דרך RPC.
-- מונע ריצה כפולה כשיש יותר ממכונה אחת (Railway).
create or replace function public.pg_try_advisory_lock(key bigint)
returns boolean language sql security definer as $$
  select pg_try_advisory_lock(key);
$$;

create or replace function public.pg_advisory_unlock(key bigint)
returns boolean language sql security definer as $$
  select pg_advisory_unlock(key);
$$;

revoke all on function public.pg_try_advisory_lock(bigint) from public, anon, authenticated;
revoke all on function public.pg_advisory_unlock(bigint)   from public, anon, authenticated;
```

⚠️ **הצג למשתמש להרצה.**

- [ ] **Step 3: רישום ב-`instrumentation.ts`**

הוסף בסוף `register()`, אחרי הבלוק של `loans-report`:

```ts
  // ── תור מיילים מתוזמנים (מכתבי ברכה, משוב בית החלמה) — בדיקה שעתית ──
  if (process.env.SCHEDULED_MAIL_DISABLED !== '1') {
    const tickScheduled = async () => {
      try {
        const { runScheduledMail } = await import('@/lib/scheduledMail')
        const res = await runScheduledMail()
        if (res.sent || res.failed || res.skipped) {
          console.log(`[scheduled-mail] sent=${res.sent} failed=${res.failed} skipped=${res.skipped}`)
        }
      } catch (err) { console.error('[scheduled-mail] tick failed', err) }
    }
    setTimeout(() => { void tickScheduled(); setInterval(() => { void tickScheduled() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[scheduled-mail] hourly scheduler started')
  }
```

- [ ] **Step 4: אימות טיפוסים**

Run: `npx tsc --noEmit`
Expected: שגיאה אחת בלבד — `Cannot find module './scheduledMailSenders'`. זה צפוי (נוצר ב-Task 6).

- [ ] **Step 5: Commit**

```bash
git add lib/scheduledMail.ts instrumentation.ts supabase/migrations/20260722_scheduled_emails.sql
git commit -m "feat: תור מיילים מתוזמנים + worker שעתי עם advisory lock"
```

---

## Task 4: `lib/voucherKit.ts` — חילוץ עוזרי PDF

**מטרה:** לאפשר לשובר הברכה להשתמש באותו עיצוב בדיוק. **אסור שתשתנה התנהגות השוברים הקיימים.**

**Files:**
- Create: `lib/voucherKit.ts`
- Modify: `lib/maternityVoucher.ts`

**Interfaces:**
- Produces: `PALETTE`, `drawHeader`, `goldDivider`, `detailsBox`, `isoNum`, `hebrewDate`, `loadFonts`, `PAGE`, `MARGIN`

- [ ] **Step 1: קריאת המקור**

Run: `cat lib/maternityVoucher.ts`

זהה את הבלוקים: קבועי צבע · `isoNum` · תאריך עברי · `goldDivider` · `drawHeader` · `detailsBox` · טעינת פונט/לוגו.

- [ ] **Step 2: יצירת `lib/voucherKit.ts`**

העבר את הבלוקים הנ"ל **בהעתקה מדויקת, ללא שינוי לוגי**. הוסף `export` לכל אחד. שמור על ההערות בעברית.

הקובץ מייצא: `PAGE`, `MARGIN`, `PALETTE` (NAVY/GOLD/CREAM/RED/SUB), `isoNum`, `hebrewDate`, `goldDivider`, `drawHeader`, `detailsBox`, ו-`loadFonts(pdfDoc)`.

- [ ] **Step 3: עדכון `lib/maternityVoucher.ts`**

מחק את ההגדרות שהועברו, והחלף ב-import:

```ts
import { PAGE, MARGIN, PALETTE, isoNum, hebrewDate, goldDivider, drawHeader, detailsBox, loadFonts } from './voucherKit'
```

**אל תשנה שום דבר אחר בקובץ.**

- [ ] **Step 4: אימות שאין רגרסיה**

Run: `npx tsc --noEmit`
Expected: PASS (מלבד `scheduledMailSenders` מ-Task 3)

Run: `npm run build`
Expected: PASS

**אימות ויזואלי חובה:** הרץ את השרת, אשר לידת בדיקה, וודא ששני השוברים (כרטיס מזון + הבראה) **נראים בדיוק כמו קודם**. זו הבדיקה היחידה שתופסת רגרסיה כאן.

- [ ] **Step 5: Commit**

```bash
git add lib/voucherKit.ts lib/maternityVoucher.ts
git commit -m "refactor: חילוץ עוזרי PDF משותפים ל-voucherKit (ללא שינוי התנהגות)"
```

---

## Task 5: מיגרציית מכתבי ברכה + משוב

**Files:**
- Create: `supabase/migrations/20260723_gratitude_and_feedback.sql`

- [ ] **Step 1: כתיבת המיגרציה**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- מכתבי ברכה לנדיב + משוב על בית ההחלמה.
-- הערה: מול היולדת לא משתמשים במילה "סקר" — הניסוח הוא
-- "לצורך ייעול ושיפור השירות". השמות הטכניים כאן נשארים survey_*.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── מכתבי ברכה ──
create table if not exists public.gratitude_letters (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  source           text not null check (source in ('web','email','scan')),
  body             text,
  signature        text,
  is_anonymous     boolean not null default true,
  scan_url         text,
  voucher_url      text,
  status           text not null default 'received'
                   check (status in ('received','approved','rejected')),
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- מכתב אחד לכל לידה
create unique index if not exists gratitude_letters_unique
  on public.gratitude_letters (maternity_aid_id);
create index if not exists gratitude_letters_date
  on public.gratitude_letters (created_at desc);

alter table public.gratitude_letters enable row level security;
drop policy if exists gratitude_letters_staff_all on public.gratitude_letters;
create policy gratitude_letters_staff_all on public.gratitude_letters
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── שאלות המשוב (ניתנות לעריכה מההגדרות, ללא שינוי קוד) ──
create table if not exists public.survey_questions (
  id        uuid primary key default gen_random_uuid(),
  survey    text not null default 'recovery',
  position  int  not null,
  text      text not null,
  type      text not null default 'scale' check (type in ('scale','text')),
  is_active boolean not null default true
);

alter table public.survey_questions enable row level security;
drop policy if exists survey_questions_staff_all on public.survey_questions;
create policy survey_questions_staff_all on public.survey_questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- זריעה ראשונית (אידמפוטנטית — רק אם הטבלה ריקה)
insert into public.survey_questions (survey, position, text, type)
select * from (values
  ('recovery', 1, 'הקבלה והליווי בבית ההחלמה', 'scale'),
  ('recovery', 2, 'ניקיון החדר והמתקנים', 'scale'),
  ('recovery', 3, 'האוכל והכיבוד', 'scale'),
  ('recovery', 4, 'האם תמליצי לחברה על בית ההחלמה הזה?', 'scale'),
  ('recovery', 5, 'הערות — משהו שהיינו יכולים לשפר?', 'text')
) as v(survey, position, text, type)
where not exists (select 1 from public.survey_questions where survey = 'recovery');

-- ── תשובות המשוב ──
create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  maternity_aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  beneficiary_id   uuid references public.beneficiaries(id) on delete set null,
  recovery_home    text,
  source           text not null check (source in ('web','email')),
  answers          jsonb not null default '{}'::jsonb,
  free_text        text,
  created_at       timestamptz not null default now()
);

-- חד-פעמיות: תשובה אחת לכל לידה (נאכף ברמת ה-DB, לא רק בקוד)
create unique index if not exists survey_responses_unique
  on public.survey_responses (maternity_aid_id);
create index if not exists survey_responses_home
  on public.survey_responses (recovery_home);

alter table public.survey_responses enable row level security;
drop policy if exists survey_responses_staff_all on public.survey_responses;
create policy survey_responses_staff_all on public.survey_responses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
```

- [ ] **Step 2: המשתמש מריץ ב-Supabase SQL Editor** ⚠️

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260723_gratitude_and_feedback.sql
git commit -m "feat: טבלאות מכתבי ברכה ומשוב בית החלמה"
```

---

## Task 6: `lib/publicToken.ts` + `lib/scheduledMailSenders.ts`

**Files:**
- Create: `lib/publicToken.ts`
- Create: `lib/scheduledMailSenders.ts`
- Modify: `lib/emailTemplates.ts`

**Interfaces:**
- Consumes: `scheduled_emails` (Task 2)
- Produces:
  - `signPublicToken(kind: 'g'|'s', aidId: string): string`
  - `verifyPublicToken(token: string, kind: 'g'|'s'): string | null` (מחזיר aidId)
  - `sendScheduled(db, job): Promise<{ outcome: 'sent'|'cancelled'|'failed'; reason?: string }>`
  - `gratitudeRequestEmail(...)`, `recoveryFeedbackEmail(...)`, `gratitudeReceivedEmail(...)`

- [ ] **Step 1: `lib/publicToken.ts`**

מבוסס על הדפוס המדויק מ-`lib/portalSession.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto'

// טוקן חתום לקישורים ציבוריים (מכתב ברכה / משוב בית החלמה).
// אותו דפוס HMAC כמו lib/portalSession.ts.
const TTL_MS = 90 * 24 * 60 * 60 * 1000   // 90 יום

function secret(): string {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

export function signPublicToken(kind: 'g' | 's', aidId: string): string {
  const exp = Date.now() + TTL_MS
  const payload = `${kind}:${aidId}:${exp}`
  return Buffer.from(`${payload}:${sign(payload)}`).toString('base64url')
}

export function verifyPublicToken(token: string | undefined, kind: 'g' | 's'): string | null {
  if (!token) return null
  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }

  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return null
  const payload = decoded.slice(0, lastSep)
  const sig = decoded.slice(lastSep + 1)

  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const [k, aidId, expStr] = payload.split(':')
  if (k !== kind || !aidId) return null
  if (Number(expStr) < Date.now()) return null
  return aidId
}
```

- [ ] **Step 2: תבניות המייל ב-`lib/emailTemplates.ts`**

הוסף בסוף הקובץ. **שים לב לניסוח — המילה "סקר" אסורה.**

```ts
// ─── בקשת מכתב ברכה לנדיב (10 ימים אחרי אישור הלידה) ────────────────────────
export function gratitudeRequestEmail(args: {
  familyName?: string | null
  motherName?: string | null
  formUrl: string
}): BuiltEmail {
  const body = `
    ${greetMrs(args.familyName, args.motherName)}
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      מזל טוב חוזר לרגל השמחה!
    </p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      הסיוע שקיבלת התאפשר בזכות נדיב לב שבחר לתמוך ביולדות הקהילה, בעילום שם.
      נשמח מאוד אם תרצי לכתוב לו כמה מילות ברכה והכרת הטוב — מכתב קצר שיחמם את ליבו
      ויראה לו שהתמיכה שלו הגיעה למקום הנכון.
    </p>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">
      <strong>אין בכך שום חובה</strong> — רק מי שרוצה ומרגישה בכך.
    </p>
    ${btn(args.formUrl, 'לכתיבת דברי ברכה', '#C69D2D')}
    <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.8;font-family:Arial,sans-serif;">
      אפשר גם פשוט <strong>להשיב למייל הזה</strong> ולכתוב את הברכה בגוף ההודעה — אנחנו נדאג לשאר.<br>
      ולמי שמעדיפה לכתוב בכתב יד — מצורף כאן דף מעוצב להדפסה, שאפשר לצלם ולשלוח לנו בחזרה.
    </p>`
  return {
    subject: 'דברי ברכה לנדיב — היכל החתם סופר',
    html: shell({
      preheader: 'נשמח לכמה מילות ברכה לנדיב שסייע לך',
      accent: '#C69D2D',
      title: 'דברי ברכה',
      subtitle: 'הכרת הטוב לנדיב',
      body,
    }),
  }
}

// ─── בקשת משוב על בית ההחלמה (5 ימים אחרי סימון הגעה) ───────────────────────
// חשוב: לא להשתמש במילה "סקר" מול היולדת.
export function recoveryFeedbackEmail(args: {
  familyName?: string | null
  motherName?: string | null
  recoveryHome?: string | null
  formUrl: string
  questions: { position: number; text: string; type: string }[]
}): BuiltEmail {
  const scaleQs = args.questions.filter(q => q.type === 'scale')
  const list = scaleQs
    .map(q => `<tr><td style="padding:6px 0;color:#334155;font-size:14px;font-family:Arial,sans-serif;">
        <strong>${q.position}.</strong> ${escapeHtml(q.text)}
      </td></tr>`)
    .join('')
  const example = scaleQs.map(q => `${q.position}-8`).join(' ')

  const body = `
    ${greetMrs(args.familyName, args.motherName)}
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      אנו מקווים שהשהות ב<strong>${escapeHtml(args.recoveryHome ?? 'בית ההחלמה')}</strong> הייתה נעימה ומרגיעה.
    </p>
    <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת בבית ההחלמה.
      זה ייקח פחות מדקה, ויעזור לנו לדאוג טוב יותר ליולדות הבאות.
    </p>
    ${btn(args.formUrl, 'למילוי המשוב', '#1B3256')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr><td style="background:#f8fafc;border-radius:10px;padding:16px 20px;">
        <p style="margin:0 0 10px;color:#1B3256;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;">
          או פשוט השיבי למייל הזה
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table>
        <p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:1.7;font-family:Arial,sans-serif;">
          כתבי בשורה אחת את הציונים מ-1 עד 10, למשל:<br>
          <strong style="color:#1B3256;font-size:15px;letter-spacing:1px;">${example}</strong>
        </p>
      </td></tr>
    </table>`
  return {
    subject: 'נשמח לשמוע ממך — היכל החתם סופר',
    html: shell({
      preheader: 'לצורך ייעול ושיפור השירות',
      accent: '#1B3256',
      title: 'איך היה בבית ההחלמה?',
      subtitle: 'לצורך ייעול ושיפור השירות',
      body,
    }),
  }
}

// ─── אישור קבלת מכתב הברכה ──────────────────────────────────────────────────
export function gratitudeReceivedEmail(args: {
  familyName?: string | null
  motherName?: string | null
}): BuiltEmail {
  const body = `
    ${greetMrs(args.familyName, args.motherName)}
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      דברי הברכה שלך התקבלו אצלנו, ואנו נדאג להעבירם לנדיב.
    </p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;font-family:Arial,sans-serif;">
      תודה רבה מקרב לב — זה בדיוק מה שנותן כוח להמשיך.
    </p>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.8;font-family:Arial,sans-serif;">
      מצורף עותק מעוצב של המכתב.
    </p>`
  return {
    subject: 'קיבלנו את דברי הברכה — תודה רבה',
    html: shell({
      preheader: 'דברי הברכה שלך התקבלו',
      accent: '#C69D2D',
      title: 'תודה רבה!',
      subtitle: 'דברי הברכה התקבלו',
      body,
    }),
  }
}
```

⚠️ `escapeHtml`, `shell`, `btn`, `greetMrs` הן פונקציות **פרטיות** בקובץ — הקוד החדש נמצא באותו קובץ ולכן ניגש אליהן ישירות. אין צורך לייצא.

- [ ] **Step 3: `lib/scheduledMailSenders.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { gratitudeRequestEmail, recoveryFeedbackEmail } from './emailTemplates'
import { signPublicToken } from './publicToken'
import { buildGratitudeVoucher } from './gratitudeVoucher'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

interface Job {
  id: string
  kind: string
  entity_id: string
  to_email: string
  payload: Record<string, unknown>
}

export interface SendOutcome {
  outcome: 'sent' | 'cancelled' | 'failed'
  reason?: string
}

/** שולח מייל מתוזמן לפי סוגו, אחרי אימות שהישות עדיין רלוונטית. */
export async function sendScheduled(db: SupabaseClient, job: Job): Promise<SendOutcome> {
  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, status, birth_type, recovery_home, recovery_arrived, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', job.entity_id)
    .maybeSingle()

  if (!aid) return { outcome: 'cancelled', reason: 'הרשומה נמחקה' }
  if (aid.status !== 'active') return { outcome: 'cancelled', reason: 'הלידה אינה מאושרת' }

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as
    { family_name?: string; spouse_name?: string; email?: string } | null

  const familyName = ben?.family_name ?? null
  const motherName = ben?.spouse_name ?? null

  if (job.kind === 'gratitude_letter') {
    if ((aid.birth_type ?? 'live') === 'silent') {
      return { outcome: 'cancelled', reason: 'לידה שקטה' }
    }
    const token = signPublicToken('g', aid.id)
    const mail = gratitudeRequestEmail({
      familyName, motherName,
      formUrl: `${SITE}/gratitude/${token}`,
    })
    const pdf = await buildGratitudeVoucher({ mode: 'blank' })
    const res = await deliverMail(job.to_email, mail.subject, mail.html, [pdf], {
      ...mailFor('maternity'),
      replyTo: `office+g${token}@chasamsofer.info`,
    })
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: res.error }
  }

  if (job.kind === 'recovery_survey') {
    if (aid.recovery_arrived !== true) {
      return { outcome: 'cancelled', reason: 'סימון ההגעה בוטל' }
    }
    const { data: questions } = await db
      .from('survey_questions')
      .select('position, text, type')
      .eq('survey', 'recovery').eq('is_active', true)
      .order('position')

    const token = signPublicToken('s', aid.id)
    const mail = recoveryFeedbackEmail({
      familyName, motherName,
      recoveryHome: aid.recovery_home ?? (job.payload.recovery_home as string) ?? null,
      formUrl: `${SITE}/feedback/${token}`,
      questions: questions ?? [],
    })
    const res = await deliverMail(job.to_email, mail.subject, mail.html, undefined, {
      ...mailFor('maternity'),
      replyTo: `office+s${token}@chasamsofer.info`,
    })
    return res.ok ? { outcome: 'sent' } : { outcome: 'failed', reason: res.error }
  }

  return { outcome: 'cancelled', reason: `סוג לא מוכר: ${job.kind}` }
}
```

- [ ] **Step 4: אימות**

Run: `npx tsc --noEmit`
Expected: שגיאה אחת — `Cannot find module './gratitudeVoucher'` (נוצר ב-Task 7)

- [ ] **Step 5: Commit**

```bash
git add lib/publicToken.ts lib/scheduledMailSenders.ts lib/emailTemplates.ts
git commit -m "feat: טוקן ציבורי + תבניות מייל למכתב ברכה ומשוב"
```

---

## Task 7: `lib/gratitudeVoucher.ts` — שובר הברכה

**Files:**
- Create: `lib/gratitudeVoucher.ts`

**Interfaces:**
- Consumes: `voucherKit` (Task 4), `wrapText` מ-`lib/rtlText.ts`
- Produces: `buildGratitudeVoucher(input: GratitudeVoucherInput): Promise<MailAttachment>`

- [ ] **Step 1: המימוש**

```ts
import { PDFDocument, rgb } from 'pdf-lib'
import { PAGE, MARGIN, PALETTE, drawHeader, goldDivider, loadFonts } from './voucherKit'
import { wrapText } from './rtlText'
import type { MailAttachment } from './sendMail'

export interface GratitudeVoucherInput {
  mode: 'blank' | 'filled'
  body?: string          // הטקסט שהיולדת כתבה (mode='filled')
  signature?: string     // שורת החתימה
  familyName?: string    // מודפס רק אם isAnonymous=false
  isAnonymous?: boolean
}

const LINE_COUNT = 8
const LINE_GAP = 30
const MAX_BODY_CHARS = 1500

/**
 * שובר "דברי ברכה" — אותו עיצוב בשני מצבים:
 *  • blank  — שורות ריקות מקווקוות לכתיבה ביד
 *  • filled — הטקסט של היולדת מודפס על אותן שורות
 * העיצוב זהה לשוברי היולדות (voucherKit).
 */
export async function buildGratitudeVoucher(input: GratitudeVoucherInput): Promise<MailAttachment> {
  const pdf = await PDFDocument.create()
  const { font, bold, logo } = await loadFonts(pdf)

  const page = pdf.addPage([PAGE.W, PAGE.H])
  let y = await drawHeader(page, { font, bold, logo })

  // כותרת
  y -= 30
  const title = 'דברי ברכה'
  const titleSize = 22
  page.drawText(title, {
    x: (PAGE.W - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y, size: titleSize, font: bold, color: PALETTE.NAVY,
  })

  y -= 14
  goldDivider(page, y)
  y -= 26

  // כותרת משנה
  const sub = 'הכרת הטוב לנדיב שסייע'
  const subSize = 11
  page.drawText(sub, {
    x: (PAGE.W - font.widthOfTextAtSize(sub, subSize)) / 2,
    y, size: subSize, font, color: PALETTE.SUB,
  })
  y -= 34

  // שורות הכתיבה
  const lineX0 = MARGIN + 10
  const lineX1 = PAGE.W - MARGIN - 10
  const bodySize = 13

  const lines: string[] = input.mode === 'filled' && input.body
    ? wrapText(
        String(input.body).slice(0, MAX_BODY_CHARS),
        lineX1 - lineX0 - 10,
        (t) => font.widthOfTextAtSize(t, bodySize),
      )
    : []

  for (let i = 0; i < Math.max(LINE_COUNT, lines.length); i++) {
    // הקו עצמו
    page.drawLine({
      start: { x: lineX0, y },
      end:   { x: lineX1, y },
      thickness: 0.6,
      color: rgb(0.82, 0.84, 0.88),
      dashArray: [3, 3],
    })
    // הטקסט (אם יש) — מיושר לימין, מעל הקו
    const text = lines[i]
    if (text) {
      const w = font.widthOfTextAtSize(text, bodySize)
      page.drawText(text, { x: lineX1 - w, y: y + 6, size: bodySize, font, color: PALETTE.NAVY })
    }
    y -= LINE_GAP
  }

  // "בכבוד רב,"
  y -= 10
  const closing = 'בכבוד רב,'
  const closingSize = 13
  page.drawText(closing, {
    x: lineX1 - bold.widthOfTextAtSize(closing, closingSize),
    y, size: closingSize, font: bold, color: PALETTE.NAVY,
  })

  // שורת החתימה (קצרה)
  y -= 26
  const sigX0 = lineX1 - 200
  page.drawLine({
    start: { x: sigX0, y }, end: { x: lineX1, y },
    thickness: 0.6, color: rgb(0.82, 0.84, 0.88), dashArray: [3, 3],
  })

  const sigText = input.mode === 'filled'
    ? (input.signature?.trim() ||
       (input.isAnonymous === false && input.familyName ? `משפחת ${input.familyName}` : 'משפחה מודה'))
    : ''
  if (sigText) {
    const w = font.widthOfTextAtSize(sigText, bodySize)
    page.drawText(sigText, { x: lineX1 - w, y: y + 6, size: bodySize, font, color: PALETTE.NAVY })
  }

  const bytes = await pdf.save()
  return {
    filename: 'דברי-ברכה.pdf',
    mimeType: 'application/pdf',
    contentB64: Buffer.from(bytes).toString('base64'),
  }
}
```

⚠️ **התאמה נדרשת:** החתימות של `drawHeader`, `goldDivider`, `loadFonts` ב-`voucherKit.ts` נגזרות מהקוד הקיים ב-`maternityVoucher.ts`. אם הן שונות ממה שמופיע כאן — **התאם את הקריאות לחתימות האמיתיות**, אל תשנה את `voucherKit`.

- [ ] **Step 2: אימות טיפוסים**

Run: `npx tsc --noEmit`
Expected: PASS (כל השגיאות מהמשימות הקודמות נפתרות עכשיו)

- [ ] **Step 3: אימות ויזואלי**

צור סקריפט זמני `scratch-voucher.ts` שקורא ל-`buildGratitudeVoucher` בשני המצבים, כותב את שני ה-PDF לדיסק, ופתח אותם.
Expected: שני קבצים — אחד עם 8 שורות ריקות, אחד עם טקסט מודפס. **אותו header, אותה מסגרת זהב, אותו לוגו כמו שוברי היולדות.**

- [ ] **Step 4: Commit**

```bash
git add lib/gratitudeVoucher.ts
git commit -m "feat: שובר דברי ברכה (blank/filled) בעיצוב שוברי היולדות"
```

---

## Task 8: חיבור הטריגרים

**Files:**
- Modify: `app/api/admin/request-approved/route.ts`
- Modify: `app/api/portal/arrived/route.ts`

- [ ] **Step 1: תזמון מכתב הברכה**

ב-`app/api/admin/request-approved/route.ts`, **בתוך בלוק הרקע** (`void (async () => {...})()`, שורה ~107), אחרי שליחת מייל האישור — בענף `type === 'maternity'`:

```ts
        // מכתב ברכה לנדיב — 10 ימים אחרי אישור הלידה (לא בלידה שקטה)
        if (type === 'maternity' && (birth.birth_type ?? 'live') !== 'silent') {
          const { scheduleEmail } = await import('@/lib/scheduledMail')
          const { addDays } = await import('@/lib/jewishCalendar')
          await scheduleEmail({
            kind: 'gratitude_letter',
            entityTable: 'maternity_aids',
            entityId: id,
            toEmail: ben?.email,
            sendAfter: addDays(new Date(), 10),
          })
        }
```

⚠️ התאם את שמות המשתנים (`id`, `ben`, `birth`) לשמות האמיתיים בקובץ. `scheduleEmail` **לעולם לא זורק** — היא בולעת שגיאות פנימית, ולכן בטוחה בתוך בלוק הרקע.

- [ ] **Step 2: תזמון וביטול המשוב**

ב-`app/api/portal/arrived/route.ts`, **אחרי** ה-`update` המוצלח (אחרי שורה 45, לפני ה-`return`):

```ts
  // משוב על בית ההחלמה — 5 ימים אחרי סימון ההגעה.
  // ביטול הסימון מבטל גם את המייל הממתין (אם טרם נשלח).
  void (async () => {
    try {
      const { scheduleEmail, cancelScheduledEmail } = await import('@/lib/scheduledMail')
      const key = { kind: 'recovery_survey' as const, entityTable: 'maternity_aids', entityId: aidId }

      if (arrived === true) {
        const { addDays } = await import('@/lib/jewishCalendar')
        const { data: full } = await admin
          .from('maternity_aids')
          .select('beneficiary:beneficiaries(email)')
          .eq('id', aidId).maybeSingle()
        const ben = Array.isArray(full?.beneficiary) ? full?.beneficiary[0] : full?.beneficiary
        await scheduleEmail({
          ...key,
          toEmail: (ben as { email?: string } | null)?.email,
          sendAfter: addDays(new Date(), 5),
          payload: { recovery_home: home },
        })
      } else {
        await cancelScheduledEmail(key)
      }
    } catch (err) {
      console.error('[arrived] תזמון משוב נכשל', err)
    }
  })()
```

⚠️ **הבלוק עטוף ב-`void (async...)()`** — הפורטל של בית ההחלמה חייב להמשיך לעבוד גם אם התזמון נכשל.

- [ ] **Step 3: אימות**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: אימות ידני מול ה-DB**

הרץ את השרת, אשר לידת בדיקה, ואז:
```sql
select kind, send_after, status from scheduled_emails order by created_at desc limit 5;
```
Expected: שורה `gratitude_letter` עם `send_after` = בעוד 10 ימים, **ולא בשבת**.

סמן "הגיעה" בפורטל בית החלמה → שורה `recovery_survey` נוספת. בטל את הסימון → אותה שורה הופכת ל-`cancelled`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/request-approved/route.ts app/api/portal/arrived/route.ts
git commit -m "feat: תזמון מכתב ברכה ומשוב בית החלמה בנקודות הטריגר"
```

---

## Task 9: `lib/surveyParse.ts` — פרסור תשובות ממייל

**Files:**
- Create: `lib/surveyParse.ts`
- Test: `lib/surveyParse.test.ts`

**Interfaces:**
- Produces:
  - `stripQuotedReply(raw: string): string`
  - `parseScores(text: string, count: number): { scores: Record<number, number>; freeText: string }`

- [ ] **Step 1: הבדיקות**

```ts
import { describe, it, expect } from 'vitest'
import { stripQuotedReply, parseScores } from './surveyParse'

describe('stripQuotedReply', () => {
  it('מסיר ציטוט בסגנון Gmail', () => {
    const raw = 'תשובה שלי\n\nOn Sun, Jul 12, 2026 at 9:00 AM היכל החתם סופר <office@x.com> wrote:\n> טקסט ישן'
    expect(stripQuotedReply(raw).trim()).toBe('תשובה שלי')
  })
  it('מסיר שורות שמתחילות ב->', () => {
    expect(stripQuotedReply('חדש\n> ישן\n> עוד ישן').trim()).toBe('חדש')
  })
  it('מסיר ציטוט בעברית', () => {
    const raw = 'הטקסט שלי\n\nבתאריך יום א׳, 12 ביולי 2026, היכל החתם סופר כתב:\nישן'
    expect(stripQuotedReply(raw).trim()).toBe('הטקסט שלי')
  })
  it('לא נוגע בטקסט נקי', () => {
    expect(stripQuotedReply('סתם טקסט').trim()).toBe('סתם טקסט')
  })
})

describe('parseScores', () => {
  it('פורמט מקף בשורה אחת', () => {
    expect(parseScores('1-8 2-9 3-7 4-10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })
  it('פורמט נקודה בשורות נפרדות', () => {
    expect(parseScores('1. 8\n2. 9\n3. 7\n4. 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })
  it('פורמט נקודתיים עם פסיקים', () => {
    expect(parseScores('1: 8, 2: 9, 3: 7, 4: 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })
  it('רק מספרים לפי הסדר', () => {
    expect(parseScores('8 9 7 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })
  it('דוחה ציון מחוץ לטווח', () => {
    const r = parseScores('1-8 2-15 3-0 4-10', 4)
    expect(r.scores).toEqual({ 1: 8, 4: 10 })
  })
  it('אוסף טקסט חופשי', () => {
    const r = parseScores('1-9 2-8\nהיה מצוין תודה רבה', 2)
    expect(r.scores).toEqual({ 1: 9, 2: 8 })
    expect(r.freeText).toContain('היה מצוין')
  })
  it('קלט זבל מחזיר ריק', () => {
    expect(parseScores('שלום מה נשמע', 4).scores).toEqual({})
  })
  it('לא מפרש מספרי טלפון כציונים', () => {
    // "רק מספרים לפי הסדר" חייב להתאים במדויק לכמות השאלות
    expect(parseScores('0501234567', 4).scores).toEqual({})
  })
})
```

- [ ] **Step 2: אימות כישלון**

Run: `npm test`
Expected: FAIL — module not found

- [ ] **Step 3: המימוש**

```ts
// פרסור תשובות משוב שנשלחו כטקסט בגוף מייל.
// גמיש בכוונה — היולדת לא אמורה לזכור פורמט מדויק.

const QUOTE_MARKERS = [
  /^On .+ wrote:$/im,
  /^בתאריך .+ כתב/im,
  /^-{2,}\s*Original Message/im,
  /^_{5,}$/m,
  /^From:\s/im,
]

/** מסיר את הציטוט של המייל המקורי מתוך תשובה. */
export function stripQuotedReply(raw: string): string {
  let text = String(raw ?? '')

  // חיתוך בנקודת הציטוט המוקדמת ביותר
  let cut = text.length
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re)
    if (m?.index !== undefined && m.index < cut) cut = m.index
  }
  text = text.slice(0, cut)

  // הסרת שורות ציטוט (">")
  text = text
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join('\n')

  return text.trim()
}

const MIN = 1
const MAX = 10

/**
 * מחלץ ציונים 1-10 מטקסט חופשי.
 * תומך ב: "1-8 2-9" · "1. 8" · "1: 8" · "8 9 7 10" (רק אם הכמות תואמת בדיוק).
 * שורות שלא נפרסרו נאספות ל-freeText.
 */
export function parseScores(
  text: string,
  count: number,
): { scores: Record<number, number>; freeText: string } {
  const clean = stripQuotedReply(text)
  const scores: Record<number, number> = {}

  // דפוס מפורש: <מספר שאלה><מפריד><ציון>
  const explicit = /(?:^|\s)([1-9])\s*[-–.:)]\s*(10|[1-9])(?=\s|$|[,;])/g
  let m: RegExpExecArray | null
  while ((m = explicit.exec(clean)) !== null) {
    const q = Number(m[1])
    const v = Number(m[2])
    if (q >= 1 && q <= count && v >= MIN && v <= MAX) scores[q] = v
  }

  // נפילה אחורה: רשימת מספרים בלבד, בכמות שתואמת בדיוק את מספר השאלות.
  // הבדיקה המדויקת חיונית — אחרת מספר טלפון ייקרא כציונים.
  if (Object.keys(scores).length === 0) {
    const onlyNumbers = clean.match(/\b(10|[1-9])\b/g)
    const hasOtherContent = clean.replace(/[\d\s,.\-–:)]/g, '').length > 0
    if (onlyNumbers && onlyNumbers.length === count && !hasOtherContent) {
      onlyNumbers.forEach((n, i) => { scores[i + 1] = Number(n) })
    }
  }

  // טקסט חופשי: השורות שאין בהן ציונים
  const freeText = clean
    .split('\n')
    .filter(line => {
      const t = line.trim()
      if (!t) return false
      // שורה שכולה ציונים/מספרים — לא טקסט חופשי
      return !/^[\d\s\-–.:,)]+$/.test(t)
    })
    .join('\n')
    .trim()

  return { scores, freeText }
}
```

- [ ] **Step 4: אימות מעבר**

Run: `npm test`
Expected: **PASS — כל הבדיקות (jewishCalendar + surveyParse).**

- [ ] **Step 5: Commit**

```bash
git add lib/surveyParse.ts lib/surveyParse.test.ts
git commit -m "feat: פרסור תשובות משוב מגוף מייל + הסרת ציטוטים"
```

---

## Task 10: קליטת מענה במייל

**Files:**
- Modify: `app/api/webhooks/resend-inbound/route.ts`
- Create: `lib/inboundGratitude.ts`

**Interfaces:**
- Consumes: `verifyPublicToken` (Task 6), `parseScores`/`stripQuotedReply` (Task 9), `buildGratitudeVoucher` (Task 7)
- Produces: `handleGratitudeReply(db, ctx): Promise<boolean>` · `handleFeedbackReply(db, ctx): Promise<boolean>`

- [ ] **Step 1: `lib/inboundGratitude.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyPublicToken } from './publicToken'
import { parseScores, stripQuotedReply } from './surveyParse'
import { buildGratitudeVoucher } from './gratitudeVoucher'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { gratitudeReceivedEmail } from './emailTemplates'

export interface InboundCtx {
  to: string[]            // כתובות הנמען (מחפשים כאן את ה-plus-addressing)
  text: string            // גוף המייל
  attachments?: { filename: string; url: string; mimeType: string }[]
}

// מחלץ טוקן מכתובת מהצורה office+g<token>@... או office+s<token>@...
function extractToken(addresses: string[], kind: 'g' | 's'): string | null {
  for (const addr of addresses) {
    const m = addr.match(new RegExp(`\\+${kind}([A-Za-z0-9_-]+)@`))
    if (m) return m[1]
  }
  return null
}

/** מכתב ברכה שהגיע במייל. מחזיר true אם טופל. */
export async function handleGratitudeReply(db: SupabaseClient, ctx: InboundCtx): Promise<boolean> {
  const token = extractToken(ctx.to, 'g')
  if (!token) return false
  const aidId = verifyPublicToken(token, 'g')
  if (!aidId) return false

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', aidId).maybeSingle()
  if (!aid) return false

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as
    { family_name?: string; spouse_name?: string; email?: string } | null

  const image = ctx.attachments?.find(a => a.mimeType?.startsWith('image/'))
  const body = stripQuotedReply(ctx.text).slice(0, 1500)

  // צרופת תמונה = שובר מודפס שצולם
  if (image) {
    await db.from('gratitude_letters').upsert({
      maternity_aid_id: aidId,
      beneficiary_id: aid.beneficiary_id,
      source: 'scan',
      body: body || null,
      scan_url: image.url,
      is_anonymous: true,
    }, { onConflict: 'maternity_aid_id' })
    return true
  }

  if (!body) return false

  // הטקסט נשתל בשובר המעוצב
  const voucher = await buildGratitudeVoucher({ mode: 'filled', body, isAnonymous: true })

  await db.from('gratitude_letters').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    source: 'email',
    body,
    is_anonymous: true,
  }, { onConflict: 'maternity_aid_id' })

  if (ben?.email) {
    const mail = gratitudeReceivedEmail({ familyName: ben.family_name, motherName: ben.spouse_name })
    await deliverMail(ben.email, mail.subject, mail.html, [voucher], mailFor('maternity'))
  }
  return true
}

/** משוב בית החלמה שהגיע במייל. מחזיר true אם טופל. */
export async function handleFeedbackReply(db: SupabaseClient, ctx: InboundCtx): Promise<boolean> {
  const token = extractToken(ctx.to, 's')
  if (!token) return false
  const aidId = verifyPublicToken(token, 's')
  if (!aidId) return false

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, recovery_home')
    .eq('id', aidId).maybeSingle()
  if (!aid) return false

  const { data: questions } = await db
    .from('survey_questions')
    .select('id, position, type')
    .eq('survey', 'recovery').eq('is_active', true).order('position')

  const scaleQs = (questions ?? []).filter(q => q.type === 'scale')
  const { scores, freeText } = parseScores(ctx.text, scaleQs.length)

  if (Object.keys(scores).length === 0 && !freeText) return false

  // המרת מספר-שאלה → מזהה-שאלה
  const answers: Record<string, number> = {}
  for (const q of scaleQs) {
    const v = scores[q.position]
    if (v !== undefined) answers[q.id] = v
  }

  await db.from('survey_responses').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    recovery_home: aid.recovery_home,
    source: 'email',
    answers,
    free_text: freeText || null,
  }, { onConflict: 'maternity_aid_id', ignoreDuplicates: true })

  return true
}
```

- [ ] **Step 2: חיבור ל-webhook**

ב-`app/api/webhooks/resend-inbound/route.ts` — **מוקדם ככל האפשר** אחרי חילוץ המייל (`to`, `text`, `attachments`) ולפני הזרימה הרגילה:

```ts
    // ניתוב מענה למכתב ברכה / משוב בית החלמה (plus-addressing)
    const toList: string[] = Array.isArray(to) ? to : [to].filter(Boolean)
    if (toList.some(a => /\+[gs][A-Za-z0-9_-]+@/.test(a))) {
      const { handleGratitudeReply, handleFeedbackReply } = await import('@/lib/inboundGratitude')
      const ctx = { to: toList, text: bodyText ?? '', attachments: savedAttachments }
      if (await handleGratitudeReply(admin, ctx)) return NextResponse.json({ ok: true, routed: 'gratitude' })
      if (await handleFeedbackReply(admin, ctx))  return NextResponse.json({ ok: true, routed: 'feedback' })
    }
```

⚠️ **התאם את שמות המשתנים** (`to`, `bodyText`, `savedAttachments`, `admin`) לשמות האמיתיים בקובץ. שים את הבלוק **אחרי** שהצרופות נשמרו ל-Storage, כדי שיהיה `url` לתמונה.

- [ ] **Step 3: אימות**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/inboundGratitude.ts app/api/webhooks/resend-inbound/route.ts
git commit -m "feat: קליטת מכתב ברכה ומשוב מגוף מייל חוזר"
```

---

## Task 11: הדפים הציבוריים

**Files:**
- Create: `app/gratitude/[token]/page.tsx`
- Create: `app/gratitude/[token]/GratitudeForm.tsx`
- Create: `app/feedback/[token]/page.tsx`
- Create: `app/feedback/[token]/FeedbackForm.tsx`
- Create: `app/api/public/gratitude/route.ts`
- Create: `app/api/public/feedback/route.ts`

**Interfaces:**
- Consumes: `verifyPublicToken`, `buildGratitudeVoucher`, `rateLimit`

- [ ] **Step 1: `app/api/public/gratitude/route.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyPublicToken } from '@/lib/publicToken'
import { buildGratitudeVoucher } from '@/lib/gratitudeVoucher'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { gratitudeReceivedEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

const MAX_BODY = 1500

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ניקוי טקסט חופשי — הסרת תגי HTML לחלוטין (הטקסט נכנס ל-PDF ולמייל)
function clean(s: unknown): string {
  return String(s ?? '').replace(/<[^>]*>/g, '').slice(0, MAX_BODY).trim()
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`gratitude:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { token, body, signature, isAnonymous, preview } = await request.json()
  const aidId = verifyPublicToken(token, 'g')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין או שפג תוקפו' }, { status: 401 })

  const text = clean(body)
  if (!text) return NextResponse.json({ error: 'לא נכתבו דברי ברכה' }, { status: 400 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, email)')
    .eq('id', aidId).maybeSingle()
  if (!aid) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

  const ben = (Array.isArray(aid.beneficiary) ? aid.beneficiary[0] : aid.beneficiary) as
    { family_name?: string; spouse_name?: string; email?: string } | null

  const anon = isAnonymous !== false
  const voucher = await buildGratitudeVoucher({
    mode: 'filled',
    body: text,
    signature: clean(signature).slice(0, 60),
    familyName: ben?.family_name,
    isAnonymous: anon,
  })

  // תצוגה מקדימה — לא שומרים כלום
  if (preview) {
    return NextResponse.json({ pdf: voucher.contentB64 })
  }

  const { error } = await db.from('gratitude_letters').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid.beneficiary_id,
    source: 'web',
    body: text,
    signature: clean(signature).slice(0, 60) || null,
    is_anonymous: anon,
  }, { onConflict: 'maternity_aid_id' })
  if (error) return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })

  // אישור ליולדת — לא חוסם
  void (async () => {
    if (!ben?.email) return
    const mail = gratitudeReceivedEmail({ familyName: ben.family_name, motherName: ben.spouse_name })
    await deliverMail(ben.email, mail.subject, mail.html, [voucher], mailFor('maternity'))
  })()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: `app/api/public/feedback/route.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { verifyPublicToken } from '@/lib/publicToken'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — טעינת השאלות + בדיקה אם כבר נענה
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const aidId = verifyPublicToken(token, 's')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין' }, { status: 401 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [{ data: questions }, { data: existing }, { data: aid }] = await Promise.all([
    db.from('survey_questions').select('id, position, text, type')
      .eq('survey', 'recovery').eq('is_active', true).order('position'),
    db.from('survey_responses').select('id').eq('maternity_aid_id', aidId).maybeSingle(),
    db.from('maternity_aids').select('recovery_home').eq('id', aidId).maybeSingle(),
  ])

  return NextResponse.json({
    questions: questions ?? [],
    answered: Boolean(existing),
    recoveryHome: aid?.recovery_home ?? null,
  })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`feedback:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const { token, answers, freeText } = await request.json()
  const aidId = verifyPublicToken(token, 's')
  if (!aidId) return NextResponse.json({ error: 'קישור לא תקין או שפג תוקפו' }, { status: 401 })

  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ולידציה: רק ציונים 1-10, ורק לשאלות שקיימות
  const { data: questions } = await db.from('survey_questions')
    .select('id, type').eq('survey', 'recovery').eq('is_active', true)
  const validIds = new Set((questions ?? []).filter(q => q.type === 'scale').map(q => q.id))

  const cleanAnswers: Record<string, number> = {}
  for (const [qid, val] of Object.entries(answers ?? {})) {
    const n = Number(val)
    if (validIds.has(qid) && Number.isInteger(n) && n >= 1 && n <= 10) cleanAnswers[qid] = n
  }

  const { data: aid } = await db.from('maternity_aids')
    .select('beneficiary_id, recovery_home').eq('id', aidId).maybeSingle()

  const { error } = await db.from('survey_responses').upsert({
    maternity_aid_id: aidId,
    beneficiary_id: aid?.beneficiary_id ?? null,
    recovery_home: aid?.recovery_home ?? null,
    source: 'web',
    answers: cleanAnswers,
    free_text: String(freeText ?? '').replace(/<[^>]*>/g, '').slice(0, 1000).trim() || null,
  }, { onConflict: 'maternity_aid_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: הדפים**

`app/gratitude/[token]/page.tsx` — Server Component דק שמאמת את הטוקן ומרנדר את הטופס:

```tsx
import { verifyPublicToken } from '@/lib/publicToken'
import GratitudeForm from './GratitudeForm'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const aidId = verifyPublicToken(token, 'g')

  if (!aidId) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-2">הקישור אינו תקין</h1>
          <p className="text-slate-500 text-sm">ייתכן שפג תוקפו. אפשר להשיב ישירות למייל שקיבלת.</p>
        </div>
      </main>
    )
  }

  return <GratitudeForm token={token} />
}
```

`GratitudeForm.tsx` — Client Component:
- כותרת **"דברי ברכה"** + הסבר קצר וחם
- `<textarea>` (מקסימום 1,500 תווים) + מונה תווים
- שדה חתימה + checkbox **"אני מאשרת לציין את שמי"** (ברירת מחדל: **לא** מסומן)
- כפתור **"תצוגה מקדימה"** → `POST /api/public/gratitude` עם `preview: true` → מציג את ה-PDF ב-`<iframe src="data:application/pdf;base64,...">`
- כפתור **"שליחה"** → אותו endpoint בלי `preview` → מסך תודה
- עיצוב: RTL, אותה פלטה (navy `#1B3256` / gold `#C69D2D`), `components/ui/Button`

`app/feedback/[token]/page.tsx` + `FeedbackForm.tsx` — אותו דפוס:
- **כותרת: "איך היה בבית ההחלמה?"** — ⚠️ **בלי המילה "סקר"**
- טקסט פתיחה: *"לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת."*
- לכל שאלת `scale` — 10 כפתורי דירוג (1–10), עם צבע שמתמלא
- שאלת `text` — `<textarea>`
- אם `answered: true` → "כבר קיבלנו את דעתך, תודה רבה!"

- [ ] **Step 4: אימות**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

Run: `npm run dev` → פתח את שני הדפים עם טוקן אמיתי (הפק אחד בקונסולה).
Expected: הטפסים נטענים, התצוגה המקדימה מייצרת PDF, השליחה נשמרת ב-DB.

- [ ] **Step 5: Commit**

```bash
git add app/gratitude app/feedback app/api/public/gratitude app/api/public/feedback
git commit -m "feat: דפים ציבוריים למכתב ברכה ולמשוב בית החלמה"
```

---

## Task 12: לשונית האדמין

**Files:**
- Create: `app/admin/maternity/gratitude/page.tsx`
- Create: `app/admin/maternity/gratitude/GratitudeTable.tsx`
- Create: `app/api/admin/gratitude/[id]/route.ts`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `types/index.ts`
- Modify: `app/admin/maternity/recovery/RecoveryHomesView.tsx`

- [ ] **Step 1: `SectionKey`**

ב-`types/index.ts`, הוסף `'gratitude'` ל-`SectionKey`.

- [ ] **Step 2: Sidebar**

ב-`components/layout/Sidebar.tsx`, הוסף ל-`maternityChildren`:

```ts
  { href: '/admin/maternity/gratitude', label: 'מכתבי ברכה', icon: Heart, section: 'gratitude' },
```

ייבא `Heart` מ-`lucide-react`.

- [ ] **Step 3: מסך מכתבי הברכה**

`app/admin/maternity/gratitude/page.tsx` — Server Component:
```tsx
const { data } = await supabase
  .from('gratitude_letters')
  .select('*, aid:maternity_aids(birth_date, beneficiary:beneficiaries(family_name, spouse_name))')
  .order('created_at', { ascending: false })
```

`GratitudeTable.tsx` — Client:
- עמודות: תאריך · שם היולדת · **מקור** (אייקון: 🌐 web / ✉️ email / 📄 scan) · תחילת הטקסט · סטטוס
- סינון לפי סטטוס ומקור
- לחיצה → מודל: הטקסט המלא · **תצוגת השובר** (iframe) · כפתורי **אשר / דחה** · **הורדת PDF** · עריכת חתימה/אנונימיות + **רינדור מחדש**

- [ ] **Step 4: `app/api/admin/gratitude/[id]/route.ts`**

`PATCH` — `requirePermission('gratitude', 'edit')`. מקבל `{ status?, signature?, is_anonymous? }`. אם השתנו `signature`/`is_anonymous` — מרנדר מחדש את השובר.

- [ ] **Step 5: ציוני המשוב במסך בתי ההחלמה**

ב-`app/admin/maternity/recovery/RecoveryHomesView.tsx` — לכל בית החלמה, הצג **★ 8.4 · 23 תשובות**.

השאילתה (בקומפוננטת האב, Server):
```ts
const { data: responses } = await supabase
  .from('survey_responses')
  .select('recovery_home, answers')
```
חשב ממוצע פר בית החלמה בצד השרת (ממוצע כל הציונים בכל ה-`answers`), והעבר כ-prop.

- [ ] **Step 6: אימות**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/admin/maternity/gratitude app/api/admin/gratitude components/layout/Sidebar.tsx types/index.ts app/admin/maternity/recovery
git commit -m "feat: לשונית מכתבי ברכה + ציוני משוב בבתי ההחלמה"
```

---

## Task 13: אימות מקצה לקצה

- [ ] **Step 1: הרצת כל הבדיקות**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: **הכל PASS.**

- [ ] **Step 2: תרחיש מלא**

1. אשר לידת בדיקה → אמת ב-DB: `scheduled_emails` עם `kind='gratitude_letter'`, `send_after` בעוד 10 ימים, **לא בשבת**.
2. הזז ידנית: `update scheduled_emails set send_after = now() where kind='gratitude_letter';`
3. הפעל את ה-worker ידנית → המייל מגיע.
4. **בדוק את המייל:** כפתור עובד · PDF מצורף עם 8 שורות ריקות · העיצוב זהה לשוברי היולדות.
5. **מסלול web:** לחץ על הכפתור → כתוב → תצוגה מקדימה → שלח → אמת ב-`gratitude_letters` + מייל אישור עם השובר המלא.
6. **מסלול מייל:** השב למייל עם טקסט → אמת שנוצרה רשומה `source='email'` ושהטקסט **בלי הציטוט**.
7. **מסלול סריקה:** השב עם תמונה → `source='scan'` + `scan_url`.
8. **משוב:** סמן "הגיעה" בפורטל → אמת תזמון. בטל → אמת `cancelled`. סמן שוב → אמת `pending` מחדש.
9. **מענה במספרים:** השב `1-9 2-8 3-10 4-9` → אמת ב-`survey_responses`.
10. **מסך בתי ההחלמה:** אמת שהציון הממוצע מוצג.

- [ ] **Step 3: אימות שהמילה "סקר" לא דולפת**

Run: `grep -rn "סקר" app/feedback app/gratitude lib/emailTemplates.ts`
Expected: **אפס תוצאות** בכל טקסט שהיולדת רואה.

- [ ] **Step 4: Commit סופי**

```bash
git commit --allow-empty -m "test: אימות מקצה לקצה — מכתבי ברכה ומשוב בית החלמה"
```

---

## Self-Review

**כיסוי המפרט:**
| דרישה | משימה |
|---|---|
| מייל 10 ימים אחרי אישור | 3, 6, 8 |
| מייל 5 ימים אחרי הגעה | 3, 6, 8 |
| חסימת שבת/חג | **1** |
| שובר PDF מעוצב | 4, 7 |
| טופס web | 11 |
| מענה במייל → נשתל בשובר | 9, 10 |
| סריקה של שובר מודפס | 10 |
| אנונימיות לבחירת היולדת | 7, 11 |
| לשונית מכתבי ברכה | 12 |
| שאלות בטבלת DB | 5 |
| קישור חד-פעמי | 5 (unique index) |
| מענה במספרים | 9, 10 |
| ציון לכל בית החלמה | 12 |
| ביטול סימון הגעה | 3, 8 |
| מוטבת ללא מייל | 3 |
| **בלי המילה "סקר"** | **6, 11, 13** |

**עקביות טיפוסים:** `scheduleEmail`/`cancelScheduledEmail`/`runScheduledMail` (Task 3) ← נצרכות ב-8. `signPublicToken`/`verifyPublicToken` (6) ← ב-10, 11. `buildGratitudeVoucher` (7) ← ב-6, 10, 11. `parseScores`/`stripQuotedReply` (9) ← ב-10. ✅

**סיכון ידוע:** `voucherKit` (Task 4) הוא refactor על קוד פרודקשן חי. Step 4 בו כולל אימות ויזואלי חובה של השוברים הקיימים.
