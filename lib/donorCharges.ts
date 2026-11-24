import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { cleanDate } from '@/lib/donorReport'
import type { CellValue, SheetSpec } from '@/lib/xlsx'

// ─────────────────────────────────────────────────────────────────────────────
// דוח חיובים לנדיב: כל קבלה שבית החלמה הגיש (recovery_receipts) היא חיוב אחד,
// בתאריך ההגשה (שעון ישראל) ובסכום הקבלה. הדוח מקובץ לפי סניף (בית ההחלמה
// שהגיש את הקבלה) ולפי יום, עם סכום יומי לכל סניף.
//
// 🔴 כמו דוח היולדות: רק יולדות שאושרו (status='active'), ונחשפים רק שם היולדת,
// ארבע ספרות אחרונות של ת.ז., לילות, הסבר הבית וסכום. הנעילה לבית מתבצעת בשרת.
// ─────────────────────────────────────────────────────────────────────────────

export interface DonorCharge {
  id: string
  /** YYYY-MM-DD בשעון ישראל */
  date: string
  /** HH:MM בשעון ישראל */
  time: string
  /** הסניף: בית ההחלמה שהגיש את הקבלה */
  home: string
  name: string
  idLast4: string
  amount: number
  nights: number | null
  /** הסבר בית ההחלמה לקבלה, או null */
  note: string | null
  /** true לקבלה הראשונה, false לתוספת */
  initial: boolean
}

/** בחירת תאריכים: רשימת ימים (יום אחד או כמה), או טווח רציף. */
export type DateSelection = { dates: string[] } | { from: string; to: string }

export const MAX_SELECTED_DATES = 62
export const MAX_RANGE_DAYS = 366

const DAY_MS = 86_400_000

/**
 * פענוח הבחירה מהכתובת: dates=2026-11-01,2026-11-03 או from=…&to=….
 * מחזיר null כשאין בחירה תקינה. 🔴 הגבלה על אורך, כדי שבקשה אחת לא תשלוף שנים.
 */
export function parseDateSelection(p: { dates?: string | null; from?: string | null; to?: string | null }): DateSelection | null {
  if (p.dates) {
    const list = [...new Set(p.dates.split(',').map(d => cleanDate(d)).filter((d): d is string => !!d))].sort()
    if (!list.length || list.length > MAX_SELECTED_DATES) return null
    return { dates: list }
  }
  const from = cleanDate(p.from), to = cleanDate(p.to)
  if (!from || !to || from > to) return null
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > MAX_RANGE_DAYS) return null
  return { from, to }
}

export function selectionBounds(s: DateSelection): { first: string; last: string } {
  return 'dates' in s ? { first: s.dates[0], last: s.dates[s.dates.length - 1] } : { first: s.from, last: s.to }
}

export function inSelection(date: string, s: DateSelection): boolean {
  return 'dates' in s ? s.dates.includes(date) : date >= s.from && date <= s.to
}

const IL_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** חותמת זמן → תאריך ושעה בשעון ישראל. */
export function israelDateTime(iso: string): { date: string; time: string } | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const p = Object.fromEntries(IL_PARTS.formatToParts(new Date(t)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/**
 * שליפת החיובים בבחירה. השליפה מהמסד בטווח רחב ביום מכל צד (הפרש השעון),
 * והסינון המדויק לפי התאריך בשעון ישראל נעשה כאן.
 * 🔴 lockedHome: קישור נעול רואה רק את הסניף שלו.
 */
export async function loadCharges(db: SupabaseClient, sel: DateSelection, lockedHome: string | null): Promise<DonorCharge[]> {
  const { first, last } = selectionBounds(sel)
  const since = new Date(Date.parse(first) - DAY_MS).toISOString()
  const until = new Date(Date.parse(last) + 2 * DAY_MS).toISOString()
  const { rows, error } = await fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('recovery_receipts')
    .select('id, home, amount, nights, note, is_initial, created_at, aid:maternity_aids(status, recovery_home, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number))')
    .gte('created_at', since)
    .lt('created_at', until)
    .order('created_at', { ascending: true })
    .range(from, to))
  if (error) throw new Error('שליפת החיובים נכשלה')
  return toCharges(rows, sel, lockedHome)
}

type AidJoin = {
  status?: string | null
  recovery_home?: string | null
  beneficiary?: { full_name?: string | null; family_name?: string | null; spouse_name?: string | null; id_number?: string | null } | null
} | null

/** המרה וסינון של שורות המסד (טהור, לבדיקות). */
export function toCharges(rows: Record<string, unknown>[], sel: DateSelection, lockedHome: string | null): DonorCharge[] {
  const out: DonorCharge[] = []
  for (const r of rows) {
    const aid = r.aid as AidJoin
    if (!aid || aid.status !== 'active') continue
    const amount = Number(r.amount ?? 0) || 0
    if (amount <= 0) continue
    const home = String(r.home ?? '').trim() || String(aid.recovery_home ?? '').trim()
    if (!home) continue
    if (lockedHome && home !== lockedHome) continue
    const dt = israelDateTime(String(r.created_at ?? ''))
    if (!dt || !inSelection(dt.date, sel)) continue
    const b = aid.beneficiary
    const nights = Number(r.nights ?? 0) || 0
    out.push({
      id: String(r.id),
      date: dt.date,
      time: dt.time,
      home,
      name: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '—',
      idLast4: String(b?.id_number ?? '').replace(/\D/g, '').slice(-4),
      amount,
      nights: nights > 0 ? nights : null,
      note: String(r.note ?? '').trim() || null,
      initial: r.is_initial === true,
    })
  }
  return out.sort((a, b) => a.home.localeCompare(b.home, 'he') || a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

export interface ChargeDay { date: string; count: number; amount: number; charges: DonorCharge[] }
export interface ChargeBranch { home: string; count: number; amount: number; days: ChargeDay[] }
export interface ChargesReport { count: number; amount: number; branches: ChargeBranch[] }

/** קיבוץ לפי סניף ואז לפי יום. כל סכום מחושב מאותן שורות, ולכן הכול מסתכם. */
export function groupCharges(charges: DonorCharge[]): ChargesReport {
  const branches = new Map<string, ChargeBranch>()
  let amount = 0
  for (const c of charges) {
    amount += c.amount
    const b = branches.get(c.home) ?? { home: c.home, count: 0, amount: 0, days: [] }
    b.count++
    b.amount += c.amount
    let d = b.days.find(x => x.date === c.date)
    if (!d) { d = { date: c.date, count: 0, amount: 0, charges: [] }; b.days.push(d) }
    d.count++
    d.amount += c.amount
    d.charges.push(c)
    branches.set(c.home, b)
  }
  const list = [...branches.values()].sort((a, b) => a.home.localeCompare(b.home, 'he'))
  for (const b of list) b.days.sort((x, y) => x.date.localeCompare(y.date))
  return { count: charges.length, amount, branches: list }
}

export const heDate = (d: string) => d.split('-').reverse().join('.')

/** תיאור הבחירה לכותרת ולשם הקובץ. */
export function selectionLabel(s: DateSelection): string {
  if ('dates' in s) return s.dates.length === 1 ? heDate(s.dates[0]) : s.dates.map(heDate).join(', ')
  return s.from === s.to ? heDate(s.from) : `${heDate(s.from)} עד ${heDate(s.to)}`
}

/**
 * גיליונות האקסל: "סיכום" (סכום לכל יום בכל סניף, וסה״כ לסניף), ולשונית פירוט
 * לכל סניף עם שורת סה״כ מודגשת אחרי כל יום ובסוף.
 */
export function chargesSheets(report: ChargesReport): SheetSpec[] {
  const summaryRows: CellValue[][] = []
  const summaryBold: number[] = []
  for (const b of report.branches) {
    for (const d of b.days) summaryRows.push([b.home, d.date, d.count, d.amount])
    summaryBold.push(summaryRows.length)
    summaryRows.push([`סה״כ ${b.home}`, null, b.count, b.amount])
  }
  summaryBold.push(summaryRows.length)
  summaryRows.push(['סה״כ כל הסניפים', null, report.count, report.amount])

  const sheets: SheetSpec[] = [{
    name: 'סיכום',
    columns: [{ header: 'סניף' }, { header: 'תאריך', kind: 'date' }, { header: 'מספר חיובים', kind: 'number' }, { header: 'סכום (₪)', kind: 'number' }],
    rows: summaryRows,
    boldRows: summaryBold,
  }]

  const used = new Set(['סיכום'])
  for (const b of report.branches) {
    const rows: CellValue[][] = []
    const bold: number[] = []
    for (const d of b.days) {
      for (const c of d.charges) {
        rows.push([d.date, c.time, c.name, c.idLast4, c.nights, c.initial ? 'חיוב ראשון' : 'תוספת', c.note ?? '', c.amount])
      }
      bold.push(rows.length)
      rows.push([d.date, null, `סה״כ ליום ${heDate(d.date)}`, null, null, null, `${d.count} חיובים`, d.amount])
    }
    bold.push(rows.length)
    rows.push([null, null, `סה״כ ${b.home}`, null, null, null, `${b.count} חיובים`, b.amount])

    let name = b.home.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 28) || 'סניף'
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 26)} ${i}`
    used.add(name)
    sheets.push({
      name,
      columns: [
        { header: 'תאריך', kind: 'date' }, { header: 'שעה' }, { header: 'יולדת' }, { header: 'ת״ז (4 אחרונות)', kind: 'id' },
        { header: 'לילות', kind: 'number' }, { header: 'סוג' }, { header: 'הערת בית ההחלמה' }, { header: 'סכום (₪)', kind: 'number' },
      ],
      rows,
      boldRows: bold,
    })
  }
  return sheets
}
