# מרכז דוחות + מיזוג קהילות — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** מסך אחד שמנפיק אקסל של הצאצאים לפי צירוף חופשי של קהילה, דור, עיר, גיל, מספר ילדים ומצב משפחתי — ולפניו מסך שמאחד את שמות הקהילות הכפולים.

**Architecture:** שני מודולים טהורים עם בדיקות (`communitySimilarity`, `reportFilters`) הם מקור האמת; מעליהם שני מסכים ושני נתיבי API. הייצוא עובר ב-`lib/xlsx` הקיים כדי שהקובץ ייראה כמו הייצוא בצאצאים.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase, exceljs (דרך `lib/xlsx`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-reports-center-design.md`

## Global Constraints

- **תקרת 1,000 השורות:** כל שאילתה כלל-עצית חייבת `fetchAllRows` מ-`@/lib/fetchAllRows`. `.limit()` **אינו** עוקף את התקרה. המאגר: 7,108 משפחות.
- **אין middleware:** כל נתיב API מגן על עצמו. צאצאים → `requirePermission('beneficiaries', 'view'|'edit')`. מיזוג קהילות → `requireAdmin()`.
- **`app_settings.value` היא עמודת `text`:** חובה `JSON.stringify`. שמירת אובייקט גולמי נכשלת **בשקט** ומאחסנת `"[object Object]"`.
- **runtime:** כל נתיב שמשתמש ב-`lib/xlsx` חייב `export const runtime = 'nodejs'` (exceljs נשען על Buffer/zlib).
- **עברית בלבד** בכל טקסט שמוצג למשתמש.
- **ההערות בקוד** מסבירות *למה*, לא *מה* — בעברית, בסגנון הקיים בקבצים השכנים.

---

## מבנה הקבצים

| קובץ | אחריות |
|---|---|
| `lib/communitySimilarity.ts` | זיהוי קבוצות שמות דומים. טהור, בלי מסד. |
| `lib/communitySimilarity.test.ts` | בדיקות המודול |
| `lib/reportFilters.ts` | החלת סינונים + ספירת מוחרגים. טהור. |
| `lib/reportFilters.test.ts` | בדיקות המודול |
| `app/api/admin/communities/route.ts` | GET רשימת הקהילות + הצעות מיזוג |
| `app/api/admin/communities/merge/route.ts` | POST מיזוג · DELETE ביטול אחרון |
| `app/admin/settings/CommunityMerger.tsx` | מסך המיזוג |
| `app/api/admin/reports/beneficiaries/route.ts` | GET שורות מסוננות · POST ייצוא xlsx |
| `app/admin/reports/BeneficiaryReport.tsx` | מרכז הדוחות |

---

## Task 1: מודול זיהוי הקהילות הדומות

**Files:**
- Create: `lib/communitySimilarity.ts`
- Test: `lib/communitySimilarity.test.ts`

**Interfaces:**
- Consumes: אין (מודול עלה)
- Produces:
  - `normalizeForCompare(name: string): string`
  - `similarity(a: string, b: string): number` — 0..1
  - `suggestGroups(items: CommunityCount[], minScore?: number): SuggestedGroup[]`
  - `type CommunityCount = { name: string; count: number }`
  - `type SuggestedGroup = { suggestedName: string; members: CommunityCount[]; totalFamilies: number }`

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

צור `lib/communitySimilarity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeForCompare, similarity, suggestGroups } from './communitySimilarity'

// 🔴 במאגר 1,928 ערכי קהילה ל-7,108 משפחות. "ליטאי"(495) · "ליטאים"(311)
// · "ליטאית"(67) · "לטאי"(45) הם קהילה אחת של 918 משפחות המפוצלת לארבע.
// המודול *מציע* בלבד — המיזוג עצמו ידני, כי איחוד אוטומטי היה מאחד
// בטעות קהילות שנכתבות דומה בלי שהמשתמש יידע.

describe('normalizeForCompare', () => {
  it('מסיר גרש וגרשיים', () => {
    expect(normalizeForCompare("ויז'ניץ")).toBe(normalizeForCompare('ויזניץ'))
  })

  it('מאחד רווחים כפולים ורווחי קצה', () => {
    expect(normalizeForCompare('  תולדות   אהרן ')).toBe(normalizeForCompare('תולדות אהרן'))
  })

  it('מסיר סיומות ריבוי ונקבה', () => {
    const base = normalizeForCompare('ליטאי')
    expect(normalizeForCompare('ליטאים')).toBe(base)
    expect(normalizeForCompare('ליטאית')).toBe(base)
  })

  it('ערך ריק אינו מפיל', () => {
    expect(normalizeForCompare('')).toBe('')
  })
})

describe('similarity', () => {
  it('זהים = 1', () => {
    expect(similarity('גור', 'גור')).toBe(1)
  })

  it('ליטאי ולטאי דומים מאוד', () => {
    expect(similarity('ליטאי', 'לטאי')).toBeGreaterThan(0.7)
  })

  it('🔴 שמות קצרים ושונים אינם דומים', () => {
    // גור/גז שניהם קצרים; מרחק עריכה מוחלט היה מסמן אותם כדומים.
    expect(similarity('גור', 'גז')).toBeLessThan(0.7)
  })

  it('קהילות שונות לגמרי', () => {
    expect(similarity('בעלזא', 'סאטמאר')).toBeLessThan(0.5)
  })
})

describe('suggestGroups', () => {
  const items = [
    { name: 'ליטאי', count: 495 },
    { name: 'ליטאים', count: 311 },
    { name: 'ליטאית', count: 67 },
    { name: 'לטאי', count: 45 },
    { name: 'בעלזא', count: 369 },
    { name: 'גור', count: 216 },
  ]

  it('🔴 ארבע גרסאות ליטאי נופלות לקבוצה אחת', () => {
    const groups = suggestGroups(items)
    const lit = groups.find(g => g.members.some(m => m.name === 'ליטאי'))
    expect(lit).toBeDefined()
    expect(lit!.members).toHaveLength(4)
    expect(lit!.totalFamilies).toBe(918)
  })

  it('השם המוצע הוא הגרסה הנפוצה ביותר', () => {
    const groups = suggestGroups(items)
    const lit = groups.find(g => g.members.some(m => m.name === 'ליטאי'))
    expect(lit!.suggestedName).toBe('ליטאי')
  })

  it('⚠️ קהילה בלי דומים אינה מוצעת כקבוצה', () => {
    // קבוצה של אחד היא רעש — המשתמש היה עובר על 134 שורות מיותרות.
    const groups = suggestGroups(items)
    expect(groups.every(g => g.members.length >= 2)).toBe(true)
  })

  it('בעלזא וגור אינם מקובצים יחד', () => {
    const groups = suggestGroups(items)
    const belz = groups.find(g => g.members.some(m => m.name === 'בעלזא'))
    expect(belz).toBeUndefined()
  })

  it('רשימה ריקה מחזירה מערך ריק', () => {
    expect(suggestGroups([])).toEqual([])
  })

  it('הקבוצות ממוינות לפי מספר המשפחות — הגדולה קודם', () => {
    const many = [
      { name: 'אאא', count: 5 }, { name: 'אאאא', count: 6 },
      { name: 'ליטאי', count: 495 }, { name: 'ליטאים', count: 311 },
    ]
    const groups = suggestGroups(many)
    expect(groups[0].totalFamilies).toBeGreaterThan(groups[1].totalFamilies)
  })
})
```

- [ ] **Step 2: הרצה לאימות כישלון**

Run: `npx vitest run lib/communitySimilarity.test.ts`
Expected: FAIL — `Failed to resolve import "./communitySimilarity"`

- [ ] **Step 3: מימוש המודול**

צור `lib/communitySimilarity.ts`:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// זיהוי שמות קהילה שהם ככל הנראה אותה קהילה.
//
// 🔴 במאגר 1,928 ערכי `community_affiliation` ל-7,108 משפחות, כי השדה
// הוא טקסט חופשי. "ליטאי"(495) · "ליטאים"(311) · "ליטאית"(67) ·
// "לטאי"(45) הם קהילה אחת של 918 משפחות המפוצלת לארבע רשומות — ודוח
// לפי קהילה על הנתונים כמות שהם מחזיר תשובה שגויה.
//
// ⚠️ המודול *מציע* בלבד ואינו כותב דבר. מיזוג אוטומטי היה מאחד בטעות
// קהילות שנכתבות דומה, והמשתמש לא היה יודע שזה קרה.
// ─────────────────────────────────────────────────────────────────────────────

export type CommunityCount = { name: string; count: number }

export type SuggestedGroup = {
  /** הגרסה הנפוצה ביותר — מוצעת כשם המאוחד */
  suggestedName: string
  members: CommunityCount[]
  totalFamilies: number
}

/**
 * נרמול להשוואה בלבד. ⚠️ הערך המנורמל לעולם אינו נשמר למסד — הוא משמש
 * רק כדי להחליט מה דומה למה.
 */
export function normalizeForCompare(name: string): string {
  return (name ?? '')
    .replace(/["'׳״]/g, '')      // גרש/גרשיים: ויז'ניץ ↔ ויזניץ
    .replace(/\s+/g, ' ')
    .trim()
    // סיומות ריבוי/נקבה: ליטאי / ליטאים / ליטאית → אותו בסיס
    .replace(/(ים|ית|ות)$/u, '')
}

/** מרחק עריכה (Levenshtein) — כמה תווים צריך לשנות כדי לעבור בין השניים. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * ציון דמיון 0..1 על המחרוזות המנורמלות.
 *
 * ⚠️ יחסי לאורך ולא מרחק מוחלט: מרחק 1 בין "גור" ל"גז" הוא שליש מהמילה
 * ומשמעותי, בעוד מרחק 1 בין "ראחמיסטריווקא" לגרסה דומה הוא זניח.
 */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a)
  const y = normalizeForCompare(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  const longest = Math.max(x.length, y.length)
  return 1 - editDistance(x, y) / longest
}

/**
 * מקבץ ערכים דומים. הקבוצות ממוינות לפי מספר המשפחות — הגדולות קודם,
 * כי שם התיקון משפיע על הכי הרבה נתונים.
 *
 * ⚠️ קבוצה של איבר בודד אינה מוחזרת: היא רעש שמסתיר את הקבוצות האמיתיות.
 */
export function suggestGroups(items: CommunityCount[], minScore = 0.72): SuggestedGroup[] {
  const pool = items.filter(i => (i.name ?? '').trim())
  const used = new Set<string>()
  const groups: SuggestedGroup[] = []

  // מהגדול לקטן: הגרסה הנפוצה מובילה את הקבוצה ונעשית השם המוצע.
  const sorted = [...pool].sort((a, b) => b.count - a.count)

  for (const seed of sorted) {
    if (used.has(seed.name)) continue
    const members = [seed]
    used.add(seed.name)

    for (const other of sorted) {
      if (used.has(other.name)) continue
      if (similarity(seed.name, other.name) >= minScore) {
        members.push(other)
        used.add(other.name)
      }
    }

    if (members.length >= 2) {
      groups.push({
        suggestedName: seed.name,
        members,
        totalFamilies: members.reduce((s, m) => s + m.count, 0),
      })
    }
  }

  return groups.sort((a, b) => b.totalFamilies - a.totalFamilies)
}
```

- [ ] **Step 4: הרצה לאימות הצלחה**

Run: `npx vitest run lib/communitySimilarity.test.ts`
Expected: PASS — 13 בדיקות

אם `similarity('גור','גז')` עובר את הסף — העלה את `minScore` והרץ שוב. אל תשנה את הבדיקה.

- [ ] **Step 5: לינט וטיפוסים**

Run: `npx tsc --noEmit && npx eslint lib/communitySimilarity.ts lib/communitySimilarity.test.ts`
Expected: שניהם יוצאים 0

- [ ] **Step 6: Commit**

```bash
git add lib/communitySimilarity.ts lib/communitySimilarity.test.ts
git commit -m "מודול זיהוי שמות קהילה כפולים"
```

---

## Task 2: נתיב הקהילות — רשימה והצעות

**Files:**
- Create: `app/api/admin/communities/route.ts`

**Interfaces:**
- Consumes: `suggestGroups`, `CommunityCount` מ-Task 1
- Produces: `GET /api/admin/communities` → `{ items: CommunityCount[], groups: SuggestedGroup[] }`

- [ ] **Step 1: מימוש הנתיב**

צור `app/api/admin/communities/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { suggestGroups, type CommunityCount } from '@/lib/communitySimilarity'

export const dynamic = 'force-dynamic'

// רשימת ערכי הקהילה במאגר + הצעות מיזוג.
//
// 🔒 מנהל בלבד: הרשימה חושפת את התפלגות הקהילות של כל המשפחות, והמיזוג
// עצמו משנה אלפי רשומות.
export async function GET() {
  if (!(await requireAdmin())) return forbidden('מיזוג קהילות שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ fetchAllRows ולא select רגיל: 7,108 משפחות, ותקרת 1,000 השקטה
  // הייתה מחזירה ספירות שגויות שנראות תקינות לחלוטין.
  const { rows, error } = await fetchAllRows<{ community_affiliation: string | null }>(
    (from, to) => db.from('beneficiaries').select('community_affiliation').range(from, to),
  )
  if (error) return NextResponse.json({ error }, { status: 500 })

  const counts = new Map<string, number>()
  for (const r of rows) {
    const name = (r.community_affiliation ?? '').trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  const items: CommunityCount[] = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json(
    { items, groups: suggestGroups(items) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
```

- [ ] **Step 2: אימות**

Run: `npx tsc --noEmit && npx eslint app/api/admin/communities/route.ts`
Expected: שניהם 0

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/communities/route.ts
git commit -m "נתיב רשימת הקהילות והצעות המיזוג"
```

---

## Task 3: נתיב המיזוג + ביטול

**Files:**
- Create: `app/api/admin/communities/merge/route.ts`

**Interfaces:**
- Consumes: אין מ-Task 1 (המיזוג מקבל שמות מפורשים מהמסך)
- Produces:
  - `POST` body `{ from: string[], to: string, preview?: boolean }` → `{ affected: number }` (preview) או `{ ok: true, affected: number }`
  - `DELETE` → `{ ok: true, restored: number }`

- [ ] **Step 1: מימוש הנתיב**

צור `app/api/admin/communities/merge/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

const BACKUP_KEY = 'community_merge_backups'
const MAX_BACKUPS = 20

type Backup = { at: string; to: string; rows: { id: string; from: string }[] }

// ⚠️ app_settings.value היא עמודת text — חובה JSON.stringify. שמירת
// אובייקט גולמי נכשלת *בשקט* ומאחסנת "[object Object]".
async function loadBackups(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<Backup[]> {
  const { data } = await db.from('app_settings').select('value').eq('key', BACKUP_KEY).maybeSingle()
  try {
    const raw = (data as { value?: string } | null)?.value
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

async function saveBackups(db: NonNullable<ReturnType<typeof getServiceClient>>, list: Backup[]) {
  await db.from('app_settings').upsert(
    { key: BACKUP_KEY, value: JSON.stringify(list.slice(0, MAX_BACKUPS)), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

// מיזוג שמות קהילה לשם אחד.
//
// 🔒 מנהל בלבד — הפעולה משנה אלפי רשומות פרודקשן.
// ⚠️ preview:true מחזיר את מספר הרשומות המושפעות בלי לשנות דבר. המסך
// מציג אותו לפני הביצוע, כי מיזוג שגוי מתגלה רק בדוח הבא.
export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden('מיזוג קהילות שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => null) as
    | { from?: string[]; to?: string; preview?: boolean } | null
  const from = Array.isArray(body?.from) ? body!.from.filter(Boolean) : []
  const to = (body?.to ?? '').trim()
  if (!from.length || !to) return NextResponse.json({ error: 'חסרים שמות למיזוג' }, { status: 400 })

  // ⚠️ fetchAllRows: המיזוג עלול לגעת ביותר מ-1,000 רשומות (ליטאי = 918
  // לבדו), ותקרת התקרה השקטה הייתה משאירה חלק מהן מאחור.
  const { rows, error } = await fetchAllRows<{ id: string; community_affiliation: string | null }>(
    (f, t) => db.from('beneficiaries').select('id, community_affiliation').in('community_affiliation', from).range(f, t),
  )
  if (error) return NextResponse.json({ error }, { status: 500 })

  const affected = rows.filter(r => (r.community_affiliation ?? '') !== to)
  if (body?.preview) return NextResponse.json({ affected: affected.length })
  if (!affected.length) return NextResponse.json({ ok: true, affected: 0 })

  // 🔴 גיבוי לפני השינוי — בלעדיו המיזוג בלתי הפיך.
  const backups = await loadBackups(db)
  backups.unshift({
    at: new Date().toISOString(),
    to,
    rows: affected.map(r => ({ id: r.id, from: r.community_affiliation ?? '' })),
  })
  await saveBackups(db, backups)

  const { error: upErr } = await db
    .from('beneficiaries')
    .update({ community_affiliation: to })
    .in('id', affected.map(r => r.id))
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId,
    action: 'community_merged',
    entityType: 'beneficiary',
    details: { from, to, affected: affected.length },
  })

  return NextResponse.json({ ok: true, affected: affected.length })
}

// ביטול המיזוג האחרון — מחזיר לכל רשומה את השם שהיה לה.
export async function DELETE() {
  const staff = await requireAdmin()
  if (!staff) return forbidden('ביטול מיזוג שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const backups = await loadBackups(db)
  const last = backups[0]
  if (!last) return NextResponse.json({ error: 'אין מיזוג לביטול' }, { status: 404 })

  // ⚠️ שחזור פר-שם ולא בבת אחת: לכל רשומה היה ערך מקורי אחר, וכתיבה
  // אחידה הייתה מוחקת את ההבחנה שהמיזוג נועד לאחד.
  const byName = new Map<string, string[]>()
  for (const r of last.rows) {
    const list = byName.get(r.from) ?? []
    list.push(r.id)
    byName.set(r.from, list)
  }
  for (const [name, ids] of byName) {
    await db.from('beneficiaries').update({ community_affiliation: name }).in('id', ids)
  }

  await saveBackups(db, backups.slice(1))
  await logActivity(db, {
    userId: staff.userId,
    action: 'community_merge_undone',
    entityType: 'beneficiary',
    details: { to: last.to, restored: last.rows.length },
  })

  return NextResponse.json({ ok: true, restored: last.rows.length })
}
```

- [ ] **Step 2: אימות**

Run: `npx tsc --noEmit && npx eslint app/api/admin/communities/merge/route.ts`
Expected: שניהם 0

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/communities/merge/route.ts
git commit -m "נתיב מיזוג קהילות עם גיבוי וביטול"
```

---

## Task 4: מסך מיזוג הקהילות

**Files:**
- Create: `app/admin/settings/CommunityMerger.tsx`
- Modify: `app/admin/settings/page.tsx` — הוספת הרכיב

**Interfaces:**
- Consumes: `GET /api/admin/communities`, `POST|DELETE /api/admin/communities/merge`
- Produces: רכיב `<CommunityMerger />`

- [ ] **Step 1: כתיבת הרכיב**

צור `app/admin/settings/CommunityMerger.tsx`. הרכיב:

1. טוען `GET /api/admin/communities` ב-`useEffect`
2. מציג לכל קבוצה מוצעת: השמות, מספר המשפחות, צ'קבוקס לכל שם
3. שדה טקסט לשם המאוחד (ברירת מחדל `suggestedName`)
4. כפתור "בדוק" → `POST` עם `preview: true` → מציג «יעודכנו N רשומות»
5. כפתור "מזג" → `POST` בלי preview → `toast.success` + טעינה מחדש
6. כפתור "בטל מיזוג אחרון" → `DELETE`

⚠️ **הצ'קבוקסים אינם מסומנים כברירת מחדל.** סימון מראש הופך את
"המערכת מציעה" ל"המערכת מחליטה", והמשתמש היה מאשר בלי לקרוא.

⚠️ אין קריאה ל-`suggestGroups` בלקוח — היא בשרת. הרכיב מציג בלבד.

השתמש ב-`useToast` מ-`@/components/ui/Toast` ו-`Card` מ-`@/components/ui/Card`, בסגנון שאר מסכי ההגדרות.

- [ ] **Step 2: חיבור לדף ההגדרות**

הוסף ב-`app/admin/settings/page.tsx` את `<CommunityMerger />` בתוך
`<Collapsible>`, בעקבות הדפוס של `VoucherTextsManager` /
`DocTypesManager` שם.

⚠️ **אין צורך לעטוף ב-`AdminOnly`.** הדף כולו כבר מוגן ב-
`guardAdminPage` (שורה 1) — עטיפה נוספת היא כפילות שמסתירה מאיפה
ההגנה באמת מגיעה. הגנת השרת ב-Task 3 (`requireAdmin`) עומדת בפני עצמה
בכל מקרה.

- [ ] **Step 3: אימות**

Run: `npx tsc --noEmit && npx eslint app/admin/settings/CommunityMerger.tsx app/admin/settings/page.tsx`
Expected: שניהם 0

- [ ] **Step 4: Commit**

```bash
git add app/admin/settings/CommunityMerger.tsx app/admin/settings/page.tsx
git commit -m "מסך מיזוג קהילות"
```

---

## 🚦 שער: מיזוג בפועל

**עצור כאן והצג למשתמש.** הוא ממזג את הקהילות במסך לפני שממשיכים —
מרכז הדוחות נבנה על נתונים מנורמלים.

---

## Task 5: מודול סינון הדוחות

**Files:**
- Create: `lib/reportFilters.ts`
- Test: `lib/reportFilters.test.ts`

**Interfaces:**
- Consumes: אין
- Produces:
  - `type ReportRow = { id: string; familyName: string; fullName: string; idNumber: string | null; city: string | null; address: string | null; phone: string | null; email: string | null; community: string | null; generation: number | null; birthDate: string | null; childrenCount: number; maritalStatus: string | null; status: string | null }`
  - `type ReportFilters = { communities?: string[]; generations?: number[]; cities?: string[]; ageMin?: number | null; ageMax?: number | null; childrenMin?: number | null; childrenMax?: number | null; maritalStatuses?: string[]; statuses?: string[] }`
  - `type FilterResult = { rows: ReportRow[]; excluded: { reason: string; count: number }[] }`
  - `ageFrom(birthDate: string | null, today?: Date): number | null`
  - `applyFilters(rows: ReportRow[], f: ReportFilters, today?: Date): FilterResult`

- [ ] **Step 1: כתיבת הבדיקות הכושלות**

צור `lib/reportFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ageFrom, applyFilters, type ReportRow } from './reportFilters'

// ⚠️ הסינון כאן ולא ברכיב — כך הוא נבדק על מקרי הקצה האמיתיים של
// המאגר: 263 משפחות בלי שיוך לדור, 62 בלי תאריך לידה, 51 בלי מצב
// משפחתי. שורה שנופלת בגלל נתון חסר חייבת להיספר, לא להיעלם.

const TODAY = new Date('2026-08-24')

function row(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'b1', familyName: 'ישראלי', fullName: 'משה', idNumber: '123456789',
    city: 'ירושלים', address: 'הרצל 1', phone: '0501234567', email: 'a@b.com',
    community: 'ליטאי', generation: 8, birthDate: '1990-01-01',
    childrenCount: 4, maritalStatus: 'נשואים', status: 'approved', ...over,
  }
}

describe('ageFrom', () => {
  it('מחשב גיל נכון', () => {
    expect(ageFrom('1990-01-01', TODAY)).toBe(36)
  })

  it('יום הולדת שטרם הגיע השנה — שנה פחות', () => {
    expect(ageFrom('1990-12-31', TODAY)).toBe(35)
  })

  it('🔴 תאריך חסר מחזיר null ולא 0', () => {
    // גיל 0 היה נכלל בסינון "עד גיל 30" ומזייף את הדוח.
    expect(ageFrom(null, TODAY)).toBeNull()
  })

  it('🔴 תאריך פגום מחזיר null ואינו זורק', () => {
    // new Date('לא-תאריך') הוא Invalid Date; חישוב עליו מחזיר NaN.
    expect(ageFrom('לא-תאריך', TODAY)).toBeNull()
    expect(ageFrom('', TODAY)).toBeNull()
  })
})

describe('applyFilters — בלי סינון', () => {
  it('בלי שום סינון כל השורות נכללות', () => {
    const rows = [row(), row({ id: 'b2', generation: null, birthDate: null })]
    const res = applyFilters(rows, {}, TODAY)
    expect(res.rows).toHaveLength(2)
    expect(res.excluded).toEqual([])
  })

  it('⚠️ מערך סינון ריק אינו מחריג דבר', () => {
    // [] פירושו "לא נבחר", לא "אף אחד" — אחרת הדוח יוצא ריק.
    const rows = [row()]
    expect(applyFilters(rows, { communities: [], cities: [] }, TODAY).rows).toHaveLength(1)
  })
})

describe('applyFilters — סינונים', () => {
  const rows = [
    row({ id: 'a', community: 'ליטאי', generation: 8, city: 'ירושלים', childrenCount: 4, birthDate: '1990-01-01' }),
    row({ id: 'b', community: 'בעלזא', generation: 9, city: 'בית שמש', childrenCount: 7, birthDate: '1975-01-01' }),
    row({ id: 'c', community: 'ליטאי', generation: 9, city: 'בית שמש', childrenCount: 2, birthDate: '2000-01-01' }),
  ]

  it('קהילה', () => {
    expect(applyFilters(rows, { communities: ['ליטאי'] }, TODAY).rows.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('דור', () => {
    expect(applyFilters(rows, { generations: [9] }, TODAY).rows.map(r => r.id)).toEqual(['b', 'c'])
  })

  it('עיר', () => {
    expect(applyFilters(rows, { cities: ['בית שמש'] }, TODAY).rows.map(r => r.id)).toEqual(['b', 'c'])
  })

  it('טווח ילדים כולל את הקצוות', () => {
    expect(applyFilters(rows, { childrenMin: 2, childrenMax: 4 }, TODAY).rows.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('טווח גיל', () => {
    expect(applyFilters(rows, { ageMin: 40 }, TODAY).rows.map(r => r.id)).toEqual(['b'])
  })

  it('🔴 צירוף סינונים — דור + עיר + ילדים', () => {
    const res = applyFilters(rows, { generations: [9], cities: ['בית שמש'], childrenMin: 5 }, TODAY)
    expect(res.rows.map(r => r.id)).toEqual(['b'])
  })

  it('מצב משפחתי — חמשת הערכים בעברית', () => {
    const list = [row({ id: 'x', maritalStatus: 'אלמנה' }), row({ id: 'y', maritalStatus: 'נשואים' })]
    expect(applyFilters(list, { maritalStatuses: ['אלמנה'] }, TODAY).rows.map(r => r.id)).toEqual(['x'])
  })
})

describe('🔴 מוחרגים בגלל נתון חסר — נספרים ולא נעלמים', () => {
  it('שורה בלי דור מוחרגת מסינון דור ונספרת', () => {
    // 263 משפחות במאגר בלי lineage_node_id — 3.7% שהיו נעלמים בשקט.
    const rows = [row({ id: 'a', generation: 8 }), row({ id: 'b', generation: null })]
    const res = applyFilters(rows, { generations: [8] }, TODAY)
    expect(res.rows.map(r => r.id)).toEqual(['a'])
    expect(res.excluded).toContainEqual({ reason: 'חסר שיוך לדור', count: 1 })
  })

  it('שורה בלי תאריך לידה מוחרגת מסינון גיל ונספרת', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', birthDate: null })]
    const res = applyFilters(rows, { ageMin: 20 }, TODAY)
    expect(res.excluded).toContainEqual({ reason: 'חסר תאריך לידה', count: 1 })
  })

  it('⚠️ בלי סינון על השדה — שורה חסרה אינה מוחרגת', () => {
    const rows = [row({ id: 'b', generation: null, birthDate: null })]
    const res = applyFilters(rows, { cities: ['ירושלים'] }, TODAY)
    expect(res.rows).toHaveLength(1)
    expect(res.excluded).toEqual([])
  })
})
```

- [ ] **Step 2: הרצה לאימות כישלון**

Run: `npx vitest run lib/reportFilters.test.ts`
Expected: FAIL — `Failed to resolve import "./reportFilters"`

- [ ] **Step 3: מימוש המודול**

צור `lib/reportFilters.ts` שמממש את החתימות שב-Interfaces. כללי מפתח:

- `ageFrom` מחזיר `null` על תאריך ריק/פגום (`isNaN(dt.getTime())`), לעולם לא 0
- מערך סינון ריק (`[]`) או `undefined` = "לא נבחר" ואינו מחריג
- שורה שנופלת בגלל **נתון חסר** נספרת ב-`excluded` עם הסיבה בעברית
- שורה שנופלת כי הערך פשוט לא תואם — **אינה** נספרת כמוחרגת

- [ ] **Step 4: הרצה לאימות הצלחה**

Run: `npx vitest run lib/reportFilters.test.ts`
Expected: PASS — 17 בדיקות

- [ ] **Step 5: אימות ו-Commit**

```bash
npx tsc --noEmit && npx eslint lib/reportFilters.ts lib/reportFilters.test.ts
git add lib/reportFilters.ts lib/reportFilters.test.ts
git commit -m "מודול סינון הדוחות"
```

---

## Task 6: נתיב הדוח — שליפה וייצוא

**Files:**
- Create: `app/api/admin/reports/beneficiaries/route.ts`

**Interfaces:**
- Consumes: `applyFilters`, `ReportRow`, `ReportFilters` מ-Task 5; `buildXlsx`, `xlsxHeaders`, `todayStamp` מ-`@/lib/xlsx`
- Produces:
  - `GET ?filters=<json>` → `{ rows: ReportRow[], total: number, excluded: {reason,count}[], options: { communities: string[], cities: string[], generations: number[] } }`
  - `POST body { filters, columns: string[], groupBy?: 'community'|'generation'|'city' }` → קובץ xlsx

- [ ] **Step 1: מימוש הנתיב**

נקודות מפתח שחייבות להיות בקוד:

```ts
export const runtime = 'nodejs'   // ⚠️ exceljs נשען על Buffer/zlib
```

```ts
// 🔒 הייצוא מחזיר ת"ז, כתובות וטלפונים
const staff = await requirePermission('beneficiaries', 'view')
if (!staff) return forbidden('אין הרשאה לצפות בדוחות הצאצאים')
```

```ts
// ⚠️ fetchAllRows — 7,108 משפחות. .limit() אינו עוקף את התקרה השקטה,
// והדוח היה מחזיר 1,000 שורות ונראה תקין לחלוטין.
const { rows, error } = await fetchAllRows<Raw>((f, t) => db
  .from('beneficiaries')
  .select('id, family_name, full_name, id_number, city, address, phone, email, ' +
          'community_affiliation, birth_date, children_count, marital_status, ' +
          'eligibility_status, lineage:lineage_nodes(generation)')
  .range(f, t))
```

⚠️ Supabase מחזיר יחסי join לעתים כמערך ולעתים כאובייקט — חלץ דרך
`Array.isArray(r.lineage) ? r.lineage[0] : r.lineage` (הדפוס הקיים ב-`holiday-load`).

בייצוא (POST):

```ts
// ⚠️ תאריך כ-Date ולא כמחרוזת: תא-תאריך אמיתי ממוין כרונולוגית,
// מחרוזת "10/8/2026" ממוינת אלפביתית ו-1 בינואר מופיע אחרי 9 בדצמבר.
// ⚠️ ת"ז כ-kind:'id' ולא number — אחרת אקסל מוחק אפסים מובילים.
const columns: Column[] = [
  { header: 'שם משפחה', kind: 'text', width: 18 },
  { header: 'שם פרטי', kind: 'text', width: 16 },
  { header: 'ת"ז', kind: 'id', width: 12 },
  { header: 'תאריך לידה', kind: 'date', width: 12 },
  // ...
]
```

כש-`groupBy` נבחר — בנה **שני** `SheetSpec` (סיכום + פירוט) והעבר
כמערך אחד ל-`buildXlsx`, כך שהקובץ אחד ולא שתי הורדות.

- [ ] **Step 2: אימות**

Run: `npx tsc --noEmit && npx eslint app/api/admin/reports/beneficiaries/route.ts`
Expected: שניהם 0

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/reports/beneficiaries/route.ts
git commit -m "נתיב דוח הצאצאים — שליפה וייצוא xlsx"
```

---

## Task 7: מסך מרכז הדוחות

**Files:**
- Create: `app/admin/reports/BeneficiaryReport.tsx`
- Modify: `app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: נתיב Task 6
- Produces: רכיב `<BeneficiaryReport />`

- [ ] **Step 1: כתיבת הרכיב**

הרכיב מכיל:

1. **בוררי סינון** — קהילה (בחירה מרובה), דור (צ'יפים 1-11), עיר (בחירה מרובה), טווח גיל, טווח ילדים, מצב משפחתי (5 ערכים), סטטוס
2. **מונה חי** — «1,204 משפחות»
3. 🔴 **שורת המוחרגים** — «12 הוחרגו (חסר תאריך לידה)». ⚠️ בלעדיה המשתמש מניח שהדוח מלא, והחוסר נראה כמו נתון
4. **תצוגה מקדימה** — 50 שורות ראשונות
5. **בורר עמודות** דרך `useTableColumns` הקיים
6. **בורר «קבץ לפי»** — ללא / קהילה / דור / עיר
7. **כפתור הורדה** — `POST` לנתיב, הורדת ה-blob

- [ ] **Step 2: חיבור לדף הדוחות**

הוסף `<BeneficiaryReport />` ב-`app/admin/reports/page.tsx` מעל `ReportBuilder` הקיים (שהוא ליולדות).

- [ ] **Step 3: אימות מלא**

```bash
npx tsc --noEmit
npx eslint app/admin/reports/BeneficiaryReport.tsx app/admin/reports/page.tsx
npx vitest run
npx next build
```
Expected: הכול עובר, הבנייה מצליחה

- [ ] **Step 4: Commit**

```bash
git add app/admin/reports/BeneficiaryReport.tsx app/admin/reports/page.tsx
git commit -m "מרכז דוחות הצאצאים"
```

---

## סיכום כיסוי מול האפיון

| דרישת האפיון | Task |
|---|---|
| זיהוי קהילות דומות | 1 |
| רשימת קהילות + הצעות | 2 |
| מיזוג ידני + גיבוי + ביטול | 3 |
| מסך המיזוג (המשתמש מחליט) | 4 |
| סינון: קהילה/דור/עיר/גיל/ילדים/מצב משפחתי/סטטוס | 5, 7 |
| ספירת מוחרגים בגלל נתון חסר | 5, 7 |
| ייצוא בעיצוב הקיים (`buildXlsx`) | 6 |
| גיליון סיכום בקיבוץ | 6, 7 |
| `fetchAllRows` בכל שאילתה כלל-עצית | 2, 3, 6 |
| הגנת הרשאות פר-נתיב | 2, 3, 6 |
