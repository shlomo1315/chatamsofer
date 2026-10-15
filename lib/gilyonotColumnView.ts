// מיון וסינון לפי עמודה בטבלת המפיצים (תפריט בכותרת העמודה).
// עמודות עם רשימת ערכים: עיר, מסלול, כמות. עמודות עם טקסט חופשי: מפיץ, טלפון.

export type ColumnKey = 'name' | 'city' | 'route' | 'phone' | 'quantity'
export type TextColumn = 'name' | 'phone'
export type ValueColumn = 'city' | 'route' | 'quantity'
export type SortDir = 'asc' | 'desc'

export interface ColumnRow {
  full_name: string
  city: string | null
  route: number | null
  phone: string | null
  phone2?: string | null
  quantity: number
}

export interface ColumnView {
  sort: { col: ColumnKey; dir: SortDir } | null
  text: Partial<Record<TextColumn, string>>
  values: Partial<Record<ValueColumn, string[]>>
}

export const EMPTY_VIEW: ColumnView = { sort: null, text: {}, values: {} }

/** הערך שמייצג "ריק" ברשימת הערכים (בלי עיר / בלי מסלול). */
export const EMPTY_VALUE = ''

export const isTextColumn = (col: ColumnKey): col is TextColumn => col === 'name' || col === 'phone'
export const isNumericColumn = (col: ColumnKey) => col === 'route' || col === 'quantity'

const digits = (s: string) => s.replace(/\D/g, '')

/** המפתח של שורה ברשימת הערכים של עמודה. */
export function valueKey(r: ColumnRow, col: ValueColumn): string {
  if (col === 'city') return r.city?.trim() || EMPTY_VALUE
  if (col === 'route') return r.route == null ? EMPTY_VALUE : String(r.route)
  return String(r.quantity)
}

/** הערכים הקיימים בעמודה, ממוינים (ריק בסוף), עם מספר השורות לכל ערך. */
export function distinctValues(rows: ColumnRow[], col: ValueColumn): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = valueKey(r, col)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => {
    if (a.value === EMPTY_VALUE) return 1
    if (b.value === EMPTY_VALUE) return -1
    return col === 'city' ? a.value.localeCompare(b.value, 'he') : Number(a.value) - Number(b.value)
  })
}

function matchesText(r: ColumnRow, col: TextColumn, term: string): boolean {
  const t = term.trim()
  if (!t) return true
  if (col === 'name') return r.full_name.toLowerCase().includes(t.toLowerCase())
  // טלפון: "-" = בלי טלפון, "+" = יש טלפון, אחרת חיפוש ספרות (בלי מקפים ורווחים)
  const phones = [r.phone, r.phone2].filter((p): p is string => !!p?.trim())
  if (t === '-') return !phones.length
  if (t === '+') return phones.length > 0
  const d = digits(t)
  return !!d && phones.some(p => digits(p).includes(d))
}

function sortValue(r: ColumnRow, col: ColumnKey): string | number | null {
  switch (col) {
    case 'name': return r.full_name.trim() || null
    case 'city': return r.city?.trim() || null
    case 'route': return r.route
    case 'phone': return r.phone ? digits(r.phone) || null : null
    case 'quantity': return r.quantity
  }
}

/** האם יש על העמודה מיון או סינון פעיל. */
export function isColumnActive(view: ColumnView, col: ColumnKey): boolean {
  if (view.sort?.col === col) return true
  return isTextColumn(col) ? !!view.text[col]?.trim() : view.values[col] !== undefined
}

/** מנקה את המיון והסינון של עמודה אחת. */
export function clearColumn(view: ColumnView, col: ColumnKey): ColumnView {
  const text = { ...view.text }
  const values = { ...view.values }
  if (isTextColumn(col)) delete text[col]
  else delete values[col]
  return { sort: view.sort?.col === col ? null : view.sort, text, values }
}

/**
 * מסנן וממיין לפי מצב התפריטים. ערכים ריקים תמיד בסוף, בשני כיווני המיון.
 * values[col] = undefined: אין סינון. מערך: רק הערכים שבו (מערך ריק = כלום).
 */
export function applyColumnView<T extends ColumnRow>(rows: T[], view: ColumnView): T[] {
  const out = rows.filter(r =>
    (Object.keys(view.text) as TextColumn[]).every(c => matchesText(r, c, view.text[c] ?? '')) &&
    (Object.keys(view.values) as ValueColumn[]).every(c => {
      const allowed = view.values[c]
      return !allowed || allowed.includes(valueKey(r, c))
    }))
  const s = view.sort
  if (!s) return out
  const sign = s.dir === 'asc' ? 1 : -1
  return out
    .map((r, i) => ({ r, i, v: sortValue(r, s.col) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1
      const c = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), 'he', { numeric: true })
      return c ? c * sign : a.i - b.i
    })
    .map(x => x.r)
}
