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
}

export const EMPTY_FILTER: ViewFilter = { q: '', city: '', comm: '', home: '', month: '', birth: '', state: '' }

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
