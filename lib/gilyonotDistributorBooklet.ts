import { normalizeEmail } from '@/lib/gilyonot'
import {
  MAX_IMPORT_DISTRIBUTORS, cleanIdNumber, cleanNote, cleanPhone, cleanQuantity, cleanRoute, cleanText, splitCityArea,
  type DistributorFields,
} from '@/lib/gilyonotDistributors'

// ─────────────────────────────────────────────────────────────────────────────
// ייבוא "חוברת" ההרשמה של המפיצים + קובץ המסלולים של השליחים — כללים טהורים.
// החוברת: שורה לכל הרשמה (שם ומשפחה בנפרד, כתובת ברחוב/בניין/דירה, הערות לשליח).
// קובץ המסלולים: גיליון "מאוחד" וגיליון לכל עיר, עם עמודת "מסלול" = מספר העצירה
// של השליח בעיר. גיליון של עיר גובר על "מאוחד". החיבור לפי טלפון מנורמל, ואם
// לאותו טלפון יש כמה הרשמות (אדם אחד בשני בתי כנסת) — לפי השם ואז הכמות.
// הכול מחזיר דוח: מה נקלט, מה לא ולמה. שורה בלי טלפון תקין לא נכתבת.
// ─────────────────────────────────────────────────────────────────────────────

export interface Sheet { name: string; rows: string[][] }

type Col = 'route' | 'first' | 'last' | 'phone' | 'id' | 'city' | 'street' | 'building' | 'apt' | 'synagogue' | 'synagogueAddress'
  | 'community' | 'worshippers' | 'quantity' | 'extra' | 'courier' | 'kvitel' | 'email'

const key = (s: unknown) => String(s ?? '').toLowerCase().replace(/["'`׳״.,:;?!\\/\s_\-()]/g, '')

// סדר הבדיקה חשוב: "כתובת בית הכנסת" לפני "בית הכנסת", "האם תוכלו להפיץ..." לפני "שם".
const COL_RULES: [Col, (k: string) => boolean][] = [
  ['route', k => k === 'מסלול' || k === 'route'],
  ['extra', k => k.includes('ביתכנסתנוסף') || k.startsWith('האםתוכלו')],
  ['courier', k => k.startsWith('הערות')],
  ['kvitel', k => k.includes('קויטל') || k.includes('קוויטל')],
  ['synagogueAddress', k => k.startsWith('כתובתביתהכנסת') || k.startsWith('כתובתביהכנ')],
  ['synagogue', k => k.includes('ביתהכנסת') || k.includes('ביתכנסת')],
  ['community', k => k.includes('השתייכות')],
  ['worshippers', k => k.includes('מתפללים')],
  ['first', k => k === 'שם' || k === 'שםפרטי'],
  ['last', k => k === 'משפחה' || k === 'שםמשפחה'],
  ['phone', k => k.includes('טלפון') || k.includes('נייד') || k === 'פלאפון'],
  ['id', k => k === 'תז' || k === 'תעודתזהות'],
  ['city', k => k === 'עיר' || k === 'ישוב' || k === 'יישוב'],
  ['street', k => k === 'רחוב' || k === 'כתובת'],
  ['building', k => k.startsWith('מספרבנ') || k === 'בניין' || k === 'בנין'],
  ['apt', k => k.includes('קומה') || k.includes('דירה')],
  ['quantity', k => k === 'כמות' || k.startsWith('כמותגיליונות') || k.startsWith('כמותגליונות')],
  ['email', k => k === 'אימייל' || k === 'מייל' || k === 'email' || k === 'דואל'],
]

type ColMap = Partial<Record<Col, number>>

export function mapColumns(header: string[]): ColMap {
  const out: ColMap = {}
  header.forEach((cell, i) => {
    const k = key(cell)
    if (!k) return
    const rule = COL_RULES.find(([c, test]) => out[c] === undefined && test(k))
    if (rule) out[rule[0]] = i
  })
  return out
}

// גיליונות הערים בקובץ המסלולים בלי שורת כותרות, באותו סדר כמו "מאוחד"
const ROUTE_DEFAULT_COLS: ColMap = { route: 0, first: 1, last: 2, phone: 3, city: 4, street: 5, building: 6, apt: 7, quantity: 8 }

/** "0583287555/0534154971" או שני מספרים מופרדים ברווחים → טלפון וטלפון נוסף. */
export function splitPhones(v: unknown): { phones: string[]; bad: boolean } {
  const raw = String(v ?? '').trim()
  if (!raw) return { phones: [], bad: false }
  const parts = raw.split(/[/,;|\\]|\s{2,}|\s+או\s+/).map(s => s.trim()).filter(Boolean)
  const phones = [...new Set(parts.map(cleanPhone).filter((p): p is string => !!p))]
  return { phones, bad: phones.length < parts.length }
}

const nameKey = (s: string) => s.replace(/["'`׳״\s\-.]/g, '')

/** רחוב + בניין + קומה/דירה → כתובת אחת, בלי לכפול מספר בניין שכבר כתוב ברחוב. */
export function joinAddress(street: unknown, building: unknown, apt: unknown, area?: string | null): string | null {
  const s = cleanText(street, 120) ?? ''
  const b = cleanText(building, 20) ?? ''
  const a = cleanText(apt, 40) ?? ''
  const withNo = b && !s.split(/\s+/).includes(b) ? `${s} ${b}`.trim() : s || b
  const apartment = a ? (/^\d+$/.test(a) ? `דירה ${a}` : a) : ''
  const full = [withNo, apartment].filter(Boolean).join(', ')
  return cleanText(area ? `${full}${full ? ' ' : ''}(${area})` : full, 160)
}

export interface BookletRow extends DistributorFields {
  /** שורה בקובץ החוברת (1 = שורת הכותרות) */
  line: number
}

export interface Issue { line: number; name: string; value?: string; note?: string }
export interface RouteIssue { sheet: string; line: number; name: string; phone: string; route: string; note: string }

export interface BookletReport {
  registrations: number
  quantityInFile: number
  written: number
  quantityWritten: number
  withRoute: number
  /** הרשמה שנפסלה (בלי שם או בלי טלפון תקין) — לא נכתבת */
  skipped: Issue[]
  /** הרשמה זהה שהופיעה פעמיים (אותו טלפון, שם ובית כנסת) — נכתבת פעם אחת */
  duplicates: Issue[]
  /** טלפון שפוצל לשני מספרים */
  phoneSplit: Issue[]
  /** טלפון אחד לכמה הרשמות (בדרך כלל אותו אדם בשני בתי כנסת) — כולן נכתבות */
  sharedPhone: { phone: string; names: string[] }[]
  badId: Issue[]
  badQuantity: Issue[]
  /** כתיב העיר אוחד */
  cityFixed: { from: string; to: string; count: number }[]
  route: {
    rows: number
    matched: number
    matchedByName: Issue[]
    unmatched: RouteIssue[]
    ambiguous: RouteIssue[]
    invalid: RouteIssue[]
    conflicts: RouteIssue[]
    /** אותה עצירה לשני מפיצים באותה עיר */
    sharedStop: { city: string; route: number; names: string[] }[]
  }
  byCity: { city: string; distributors: number; quantity: number; withRoute: number }[]
}

const cell = (cells: string[], m: ColMap, c: Col) => (m[c] === undefined ? '' : String(cells[m[c]!] ?? ''))

function parseRegistrations(table: string[][], report: BookletReport): (BookletRow)[] | string {
  if (!table.length) return 'קובץ החוברת ריק'
  const m = mapColumns(table[0])
  if (m.first === undefined || m.phone === undefined) return 'בקובץ החוברת לא נמצאו עמודות "שם" ו"טלפון" בשורה הראשונה'
  const known = new Set(Object.values(m))
  const fixed = new Map<string, { from: string; to: string; count: number }>()
  const rows: (BookletRow)[] = []
  const seen = new Set<string>()

  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    if (!cells.some(c => String(c ?? '').trim())) return
    report.registrations++
    const first = cleanText(cell(cells, m, 'first'), 40) ?? ''
    const full_name = cleanText(`${first} ${cell(cells, m, 'last')}`, 80)
    const quantityRaw = cell(cells, m, 'quantity')
    let quantity = cleanQuantity(quantityRaw)
    if (quantity === null) { report.badQuantity.push({ line, name: full_name ?? '', value: quantityRaw, note: 'לא מספר שלם — נקלט כ-0' }); quantity = 0 }
    else if (!quantityRaw.trim()) report.badQuantity.push({ line, name: full_name ?? '', value: '', note: 'בלי כמות — נקלט כ-0' })
    report.quantityInFile += quantity

    const phoneRaw = cell(cells, m, 'phone')
    const { phones, bad } = splitPhones(phoneRaw)
    if (!full_name) { report.skipped.push({ line, name: '', value: phoneRaw, note: 'חסר שם' }); return }
    if (!phones.length) { report.skipped.push({ line, name: full_name, value: phoneRaw, note: phoneRaw.trim() ? 'מספר טלפון לא תקין' : 'בלי טלפון' }); return }
    if (phones.length > 1 || bad) report.phoneSplit.push({ line, name: full_name, value: phoneRaw, note: bad ? `נקלט רק ${phones.join(', ')}` : undefined })

    const idRaw = cell(cells, m, 'id').trim()
    const id_number = cleanIdNumber(idRaw)
    if (idRaw && !id_number) report.badId.push({ line, name: full_name, value: idRaw })

    // מייל: מהעמודה שלו, ואם אין שם — מכל עמודה שלא זוהתה (למשל "עמודה1")
    let email = normalizeEmail(cell(cells, m, 'email'))
    if (!email) for (let c = 0; c < cells.length && !email; c++) if (!known.has(c)) email = normalizeEmail(String(cells[c] ?? '').trim().split(/\s+/).pop())

    const cityRaw = cell(cells, m, 'city')
    const { city, area } = splitCityArea(cityRaw)
    const rawClean = cleanText(cityRaw, 60)
    if (city && rawClean !== city) {
      const k = `${rawClean}→${city}`
      const f = fixed.get(k) ?? { from: rawClean ?? '', to: city, count: 0 }
      f.count++
      fixed.set(k, f)
    }

    const extra = cleanText(cell(cells, m, 'extra'), 300)
    const noteParts: [string, string | null][] = [
      ['כתובת בית הכנסת', cleanText(cell(cells, m, 'synagogueAddress'), 160)],
      ['השתייכות', cleanText(cell(cells, m, 'community'), 80)],
      ['מתפללים', cleanText(cell(cells, m, 'worshippers'), 40)],
      ['בית כנסת נוסף', extra && !/^(לא|אין|-|0)$/.test(extra) ? extra : null],
      ['לשליח', cleanText(cell(cells, m, 'courier'), 400)],
      ['שמות לקויטל', cleanText(cell(cells, m, 'kvitel'), 400)],
      // ת.ז. שנפסלה (ספרת ביקורת, דרכון) לא הולכת לאיבוד
      ['ת.ז. כפי שנמסרה', idRaw && !id_number ? cleanText(idRaw, 40) : null],
    ]
    const synagogue = cleanText(cell(cells, m, 'synagogue'), 120)
    const dup = `${phones[0]}|${nameKey(full_name)}|${nameKey(synagogue ?? '')}`
    if (seen.has(dup)) { report.duplicates.push({ line, name: full_name, value: phones[0] }); return }
    seen.add(dup)

    rows.push({
      line, full_name, phone: phones[0], phone2: phones[1] ?? null, email, id_number, city,
      address: joinAddress(cell(cells, m, 'street'), cell(cells, m, 'building'), cell(cells, m, 'apt'), area),
      synagogue, quantity, route: null,
      notes: cleanNote(noteParts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n'), 1000),
    })
  })
  report.cityFixed = [...fixed.values()].sort((a, b) => b.count - a.count)
  return rows
}

function applyRoutes(rows: (BookletRow)[], sheets: Sheet[], report: BookletReport) {
  const byPhone = new Map<string, number[]>()
  rows.forEach((r, i) => [r.phone, r.phone2].forEach(p => { if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), i]) }))
  const prio = new Map<number, { p: number; sheet: string }>()
  const R = report.route

  for (const sheet of sheets) {
    if (!sheet.rows.length) continue
    // גיליון שנקרא בשם של עיר גובר על הגיליון המאוחד
    const cityOfSheet = splitCityArea(sheet.name).city
    const isCitySheet = !!cityOfSheet && rows.some(r => r.city === cityOfSheet)
    const p = isCitySheet ? 2 : 1
    const head = mapColumns(sheet.rows[0])
    const hasHeader = head.route !== undefined && head.phone !== undefined
    const m = hasHeader ? head : ROUTE_DEFAULT_COLS
    sheet.rows.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
      const line = i + (hasHeader ? 2 : 1)
      const routeRaw = cell(cells, m, 'route').trim()
      if (!routeRaw) return
      R.rows++
      const name = cleanText(`${cell(cells, m, 'first')} ${cell(cells, m, 'last')}`, 80) ?? ''
      const phoneRaw = cell(cells, m, 'phone')
      const issue = (note: string): RouteIssue => ({ sheet: sheet.name, line, name, phone: phoneRaw.trim(), route: routeRaw, note })
      const route = cleanRoute(routeRaw)
      if (!route) { R.invalid.push(issue('מספר מסלול לא תקין')); return }

      let cand = [...new Set(splitPhones(phoneRaw).phones.flatMap(ph => byPhone.get(ph) ?? []))]
      let byName = false
      if (cand.length > 1) {
        const n = cand.filter(i => nameKey(rows[i].full_name) === nameKey(name))
        if (n.length) cand = n
      }
      if (cand.length > 1) {
        const q = cleanQuantity(cell(cells, m, 'quantity'))
        const n = cand.filter(i => rows[i].quantity === q)
        if (n.length) cand = n
      }
      if (!cand.length && name) {
        const city = splitCityArea(cell(cells, m, 'city')).city
        cand = rows.map((r, i) => i).filter(i => nameKey(rows[i].full_name) === nameKey(name) && (!city || rows[i].city === city))
        byName = cand.length === 1
      }
      if (!cand.length) { R.unmatched.push(issue('לא נמצאה הרשמה עם הטלפון או השם הזה')); return }
      if (cand.length > 1) { R.ambiguous.push(issue('כמה הרשמות מתאימות — צריך לבחור ידנית')); return }
      const idx = cand[0]
      const row = rows[idx]
      const prev = prio.get(idx)
      if (row.route !== null && row.route !== route) {
        if (prev && prev.p >= p) { R.conflicts.push(issue(`ב"${prev.sheet}" המסלול ${row.route} — נשאר ${row.route}`)); return }
        R.conflicts.push(issue(`ב"${prev?.sheet}" המסלול ${row.route} — נקבע ${route} לפי גיליון העיר`))
      }
      if (row.route === null) R.matched++
      if (byName) R.matchedByName.push({ line: row.line, name: row.full_name, note: `${sheet.name}, שורה ${line}` })
      row.route = route
      if (!prev || prev.p < p) prio.set(idx, { p, sheet: sheet.name })
    })
  }

  const stops = new Map<string, { city: string; route: number; names: string[] }>()
  for (const r of rows) {
    if (r.route === null) continue
    const k = `${r.city}|${r.route}`
    const s = stops.get(k) ?? { city: r.city ?? '', route: r.route, names: [] }
    s.names.push(r.full_name)
    stops.set(k, s)
  }
  R.sharedStop = [...stops.values()].filter(s => s.names.length > 1)
}

export const NO_CITY_LABEL = 'ללא עיר'

/** החוברת + גיליונות המסלולים → מפיצים מוכנים לכתיבה ודוח מלא. */
export function buildBookletImport(booklet: string[][], routeSheets: Sheet[]): { rows: BookletRow[]; report: BookletReport; error?: string } {
  const report: BookletReport = {
    registrations: 0, quantityInFile: 0, written: 0, quantityWritten: 0, withRoute: 0,
    skipped: [], duplicates: [], phoneSplit: [], sharedPhone: [], badId: [], badQuantity: [], cityFixed: [],
    route: { rows: 0, matched: 0, matchedByName: [], unmatched: [], ambiguous: [], invalid: [], conflicts: [], sharedStop: [] },
    byCity: [],
  }
  const parsed = parseRegistrations(booklet, report)
  if (typeof parsed === 'string') return { rows: [], report, error: parsed }
  if (parsed.length > MAX_IMPORT_DISTRIBUTORS) return { rows: [], report, error: `אפשר לייבא עד ${MAX_IMPORT_DISTRIBUTORS} מפיצים בפעם אחת` }
  applyRoutes(parsed, routeSheets, report)

  const phones = new Map<string, string[]>()
  for (const r of parsed) phones.set(r.phone!, [...(phones.get(r.phone!) ?? []), r.full_name])
  report.sharedPhone = [...phones].filter(([, n]) => n.length > 1).map(([phone, names]) => ({ phone, names }))

  const city = new Map<string, BookletReport['byCity'][number]>()
  for (const r of parsed) {
    const c = r.city ?? NO_CITY_LABEL
    const s = city.get(c) ?? { city: c, distributors: 0, quantity: 0, withRoute: 0 }
    s.distributors++
    s.quantity += r.quantity
    if (r.route !== null) s.withRoute++
    city.set(c, s)
  }
  report.byCity = [...city.values()].sort((a, b) => b.distributors - a.distributors)
  report.written = parsed.length
  report.quantityWritten = parsed.reduce((s, r) => s + r.quantity, 0)
  report.withRoute = parsed.filter(r => r.route !== null).length

  const rows = [...parsed]
    .sort((a, b) => (a.city ?? '\uffff').localeCompare(b.city ?? '\uffff', 'he') || (a.route ?? 1e9) - (b.route ?? 1e9) || a.line - b.line)
  return { rows, report }
}

// ── כתיבה למסד: מי חדש, מי קיים ומה מתעדכן ──
// מפיץ קיים = אותו טלפון ואותו שם (או: הטלפון מופיע פעם אחת בלבד גם במסד וגם בחוברת).
// אצל קיים מתעדכן המסלול, וממולאים רק שדות ריקים — עריכה שנעשתה במשרד לא נדרסת.
export type ExistingDistributor = Pick<DistributorFields, 'full_name' | 'phone' | 'phone2' | 'email' | 'id_number' | 'city' | 'address' | 'synagogue' | 'quantity' | 'route' | 'notes'> & { id: string }

const FILL: (keyof DistributorFields)[] = ['phone2', 'email', 'id_number', 'city', 'address', 'synagogue', 'notes']

export function planBookletWrite(existing: ExistingDistributor[], rows: BookletRow[]): {
  inserts: DistributorFields[]
  updates: { id: string; name: string; patch: Partial<DistributorFields> }[]
  unchanged: number
} {
  const count = <T,>(list: T[], k: (x: T) => string | null) => list.reduce((m, x) => { const v = k(x); if (v) m.set(v, (m.get(v) ?? 0) + 1); return m }, new Map<string, number>())
  const dbPhones = count(existing, e => e.phone)
  const filePhones = count(rows, r => r.phone)
  const byKey = new Map(existing.filter(e => e.phone).map(e => [`${e.phone}|${nameKey(e.full_name)}`, e]))
  const byPhone = new Map(existing.filter(e => e.phone && dbPhones.get(e.phone) === 1).map(e => [e.phone!, e]))
  const used = new Set<string>()
  const inserts: DistributorFields[] = []
  const updates: { id: string; name: string; patch: Partial<DistributorFields> }[] = []
  let unchanged = 0

  for (const { line: _line, ...r } of rows) {
    let e = byKey.get(`${r.phone}|${nameKey(r.full_name)}`)
    if (!e && filePhones.get(r.phone!) === 1) e = byPhone.get(r.phone!)
    if (!e || used.has(e.id)) { inserts.push(r); continue }
    used.add(e.id)
    const patch: Partial<DistributorFields> = {}
    if (r.route !== null && r.route !== e.route) patch.route = r.route
    if (!e.quantity && r.quantity) patch.quantity = r.quantity
    for (const f of FILL) if (!e[f as keyof ExistingDistributor] && r[f]) (patch as Record<string, unknown>)[f] = r[f]
    if (Object.keys(patch).length) updates.push({ id: e.id, name: e.full_name, patch })
    else unchanged++
  }
  return { inserts, updates, unchanged }
}
