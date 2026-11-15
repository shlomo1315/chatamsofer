import type { DonorRow } from '@/lib/donorReport'

// ─────────────────────────────────────────────────────────────────────────────
// חישובי דוח הנדיב: מקור אחד לשרת ולדפדפן. כל מה שמוצג (סכום, נקודות, גרף, פילוחים,
// רשימה) נגזר מאותה רשימה מסוננת, ולכן הכול מסתכם זה בזה בכל חיפוש וסינון.
// ─────────────────────────────────────────────────────────────────────────────

export type DimKey = 'city' | 'comm' | 'home' | 'month' | 'birth' | 'state'

export interface ViewFilter {
  q: string
  city: string
  comm: string
  home: string
  month: string
  birth: string
  state: string
  /** טווח תאריכים (YYYY-MM-DD), כולל הקצוות; ריק = בלי הגבלה. */
  from: string
  to: string
}

export const EMPTY_FILTER: ViewFilter = { q: '', city: '', comm: '', home: '', month: '', birth: '', state: '', from: '', to: '' }

export const BIRTH_LABELS = ['רגילה', 'תאומים', 'שלישייה'] as const
export const STATE_LABELS = ['מומש', 'ממתינה'] as const
export const NO_MONTH = 'לא צוין'

/** חודש בפורמט mm/yy כמו בגרף (ריק כשאין תאריך). */
export function monthKey(date: string): string {
  return date ? `${date.slice(5, 7)}/${date.slice(2, 4)}` : NO_MONTH
}

/** יולדת עם סכום = מומש; בלי סכום = ממתינה (לא מוצג ₪0). */
export const stateOf = (r: DonorRow) => (r.amount > 0 ? 'מומש' : 'ממתינה')
export const birthOf = (r: DonorRow) => BIRTH_LABELS[r.kind - 1]

const VALUE: Record<DimKey, (r: DonorRow) => string> = {
  city: r => r.city,
  comm: r => r.community,
  home: r => r.home,
  month: r => monthKey(r.date),
  birth: birthOf,
  state: stateOf,
}
export const dimValue = (r: DonorRow, k: DimKey) => VALUE[k](r)
export const DIM_KEYS: DimKey[] = ['city', 'comm', 'home', 'month', 'birth', 'state']

/** חיפוש: שם מכיל את הטקסט, או ת.ז. שהשרת אישר (idMatches). */
export function matchesQuery(r: DonorRow, q: string, idMatches: ReadonlySet<string>): boolean {
  const s = q.trim()
  if (!s) return true
  return r.name.includes(s) || idMatches.has(r.id)
}

/** האם השורה עוברת את כל הסינונים, חוץ מהממד שב-skip (לספירת הצ'יפים). */
export function matches(r: DonorRow, f: ViewFilter, idMatches: ReadonlySet<string>, skip?: DimKey | 'q'): boolean {
  if (skip !== 'q' && !matchesQuery(r, f.q, idMatches)) return false
  if (f.from || f.to) {
    if (!r.date) return false
    if (f.from && r.date < f.from) return false
    if (f.to && r.date > f.to) return false
  }
  for (const k of DIM_KEYS) {
    if (k !== skip && f[k] && VALUE[k](r) !== f[k]) return false
  }
  return true
}

export const filterView = (rows: DonorRow[], f: ViewFilter, idMatches: ReadonlySet<string>) =>
  rows.filter(r => matches(r, f, idMatches))

export const isFiltered = (f: ViewFilter) => Object.values(f).some(v => v.trim() !== '')

export interface Group { value: string; count: number; amount: number }

/** ערכי ממד מסודרים: חודשים כרונולוגית, אחרת לפי כמות יורדת. */
export function dimValues(rows: DonorRow[], k: DimKey): string[] {
  if (k === 'birth') return [...BIRTH_LABELS]
  if (k === 'state') return [...STATE_LABELS]
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(VALUE[k](r), (counts.get(VALUE[k](r)) ?? 0) + 1)
  const keys = [...counts.keys()]
  if (k === 'month') {
    const sortKey = (m: string) => (m === NO_MONTH ? '0' : `${m.slice(3)}${m.slice(0, 2)}`)
    return keys.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  }
  return keys.sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b, 'he'))
}

export function groupBy(rows: DonorRow[], k: DimKey, values: string[]): Group[] {
  const m = new Map(values.map(v => [v, { value: v, count: 0, amount: 0 }]))
  for (const r of rows) {
    const g = m.get(VALUE[k](r))
    if (g) { g.count++; g.amount += r.amount }
  }
  return values.map(v => m.get(v)!)
}

export interface Totals {
  count: number
  amount: number
  /** מומשו (עם סכום). */
  paid: number
  pending: number
  /** לילות בפועל, מסכום הלילות שהוזנו. */
  nights: number
  twins: number
  triplets: number
}

export function totals(rows: DonorRow[]): Totals {
  const t: Totals = { count: rows.length, amount: 0, paid: 0, pending: 0, nights: 0, twins: 0, triplets: 0 }
  for (const r of rows) {
    t.amount += r.amount
    if (r.amount > 0) t.paid++; else t.pending++
    t.nights += r.nights ?? 0
    if (r.kind === 2) t.twins++
    if (r.kind === 3) t.triplets++
  }
  return t
}

/**
 * בדיקת התאמה: כל פילוח מסתכם לאותו סכום ולאותה כמות כמו הכותרת.
 * מקבלת את כל הרשימה (לערכי הממדים) ואת הרשימה המסוננת.
 */
export function checkSums(all: DonorRow[], shown: DonorRow[]): boolean {
  const t = totals(shown)
  return DIM_KEYS.every(k => {
    const gs = groupBy(shown, k, dimValues(all, k))
    return gs.reduce((a, g) => a + g.amount, 0) === t.amount && gs.reduce((a, g) => a + g.count, 0) === t.count
  })
}

/** נקודות המשחק: מהישנה לחדשה (לפי תאריך). */
export function ascending(rows: DonorRow[]): DonorRow[] {
  return rows.slice().sort((a, b) => a.date.localeCompare(b.date))
}

// ─────────────────────────────────────────────────────────────────────────────
// סינון לפי תקופה: קיצורי תקופה וחלוקה ליום, שבוע או חודש. הכול על תאריכי YYYY-MM-DD ב-UTC.
// ─────────────────────────────────────────────────────────────────────────────

export type Gran = 'day' | 'week' | 'month'
export type PresetKey = 'month' | 'prev' | 'd30' | 'm3' | 'ytd'

const DAY_MS = 864e5
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'month', label: 'החודש' },
  { key: 'prev', label: 'חודש קודם' },
  { key: 'd30', label: '30 יום' },
  { key: 'm3', label: '3 חודשים' },
  { key: 'ytd', label: 'מתחילת השנה' },
]

/** טווח של קיצור תקופה, יחסית ל-today (YYYY-MM-DD). */
export function presetRange(key: PresetKey, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1
  const first = (yy: number, mm: number) => toIso(Date.UTC(yy, mm, 1))
  switch (key) {
    case 'month': return { from: first(y, m), to: today }
    case 'prev': return { from: first(y, m - 1), to: toIso(Date.UTC(y, m, 1) - DAY_MS) }
    case 'd30': return { from: toIso(toMs(today) - 29 * DAY_MS), to: today }
    case 'm3': return { from: first(y, m - 2), to: today }
    case 'ytd': return { from: first(y, 0), to: today }
  }
}

/** חלוקה אוטומטית לפי אורך הטווח: עד 45 יום ביום, עד 190 בשבוע, מעבר לכך בחודש. */
export function autoGran(from: string, to: string): Gran {
  const n = (toMs(to) - toMs(from)) / DAY_MS + 1
  return n <= 45 ? 'day' : n <= 190 ? 'week' : 'month'
}

/** הטווח שמוצג: הסינון אם הוגדר, ואחרת מהתאריך הראשון עד האחרון ברשימה. null כשאין תאריכים. */
export function effectiveRange(f: Pick<ViewFilter, 'from' | 'to'>, rows: DonorRow[]): { from: string; to: string } | null {
  let min = '', max = ''
  for (const r of rows) {
    if (!r.date) continue
    if (!min || r.date < min) min = r.date
    if (!max || r.date > max) max = r.date
  }
  const from = f.from || min, to = f.to || max
  return from && to && from <= to ? { from, to } : null
}

export interface Bucket {
  start: string
  end: string
  count: number
  amount: number
  by: Record<string, { count: number; amount: number }>
}

/** עמודות הגרף: שבוע מתחיל ביום ראשון ונגמר בשבת, וחודש נגמר בסוף החודש. שורה בלי תאריך לא נספרת. */
export function buckets(rows: DonorRow[], gran: Gran, from: string, to: string, homes: string[]): Bucket[] {
  const out: Bucket[] = []
  const last = toMs(to)
  for (let s = toMs(from); s <= last;) {
    const d = new Date(s)
    const e = gran === 'day' ? s
      : gran === 'week' ? Math.min(last, s + (6 - d.getUTCDay()) * DAY_MS)
      : Math.min(last, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DAY_MS)
    out.push({ start: toIso(s), end: toIso(e), count: 0, amount: 0, by: Object.fromEntries(homes.map(h => [h, { count: 0, amount: 0 }])) })
    s = e + DAY_MS
  }
  for (const r of rows) {
    if (!r.date) continue
    const b = out.find(x => r.date >= x.start && r.date <= x.end)
    if (!b) continue
    b.count++; b.amount += r.amount
    const h = b.by[r.home]
    if (h) { h.count++; h.amount += r.amount }
  }
  return out
}
