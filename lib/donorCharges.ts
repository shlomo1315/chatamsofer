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

/**
 * הבית שהדוח מסונן אליו. 🔴 בקישור נעול הנעילה גוברת תמיד, ובית אחר מהבקשה מתעלם.
 * null = כל הבתים.
 */
export function pickHome(requested: string | null | undefined, lockedHome: string | null): string | null {
  if (lockedHome) return lockedHome
  const h = String(requested ?? '').trim()
  return h && h.length <= 120 ? h : null
}

/** רשימת הבתים שיש להם חיובים (לבורר), וסינון החיובים לבית שנבחר. */
export function splitByHome(charges: DonorCharge[], home: string | null): { homes: string[]; charges: DonorCharge[] } {
  const homes = [...new Set(charges.map(c => c.home))].sort((a, b) => a.localeCompare(b, 'he'))
  return { homes, charges: home ? charges.filter(c => c.home === home) : charges }
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

/** כל הימים בבחירה (בטווח: כל יום בטווח), לשורות של גיליון הסיכום. */
export function selectionDays(s: DateSelection): string[] {
  if ('dates' in s) return s.dates
  const out: string[] = []
  for (let t = Date.parse(s.from); t <= Date.parse(s.to); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** שם הקובץ להורדה, כמו במסך: דוח-חיובים_17.11-23.11.2026 */
export function chargesFileName(s: DateSelection): string {
  const { first, last } = selectionBounds(s)
  if (first === last) return `דוח-חיובים_${heDate(first)}`
  const from = first.slice(0, 4) === last.slice(0, 4) ? heDate(first).slice(0, 5) : heDate(first)
  return `דוח-חיובים_${from}-${heDate(last)}`
}

/**
 * גיליונות האקסל, כמו בתצוגה המקדימה במסך: "סיכום" (שורה לכל יום, עמודה לכל
 * סניף וסה״כ ליום, ושורת סה״כ מודגשת), וגיליון לכל סניף עם החיובים, סה״כ היום
 * בשורה האחרונה של כל יום, ושורת סה״כ לסניף.
 */
export function chargesSheets(report: ChargesReport, days?: string[]): SheetSpec[] {
  const homes = report.branches.map(b => b.home)
  const dayList = days ?? [...new Set(report.branches.flatMap(b => b.days.map(d => d.date)))].sort()
  const cell = (b: ChargeBranch, date: string) => b.days.find(d => d.date === date)?.amount ?? 0
  const summaryRows: CellValue[][] = dayList.map(date => {
    const perHome = report.branches.map(b => cell(b, date))
    return [date, ...perHome, perHome.reduce((a, n) => a + n, 0)]
  })
  summaryRows.push(['סה״כ', ...report.branches.map(b => b.amount), report.amount])

  const sheets: SheetSpec[] = [{
    name: 'סיכום',
    columns: [
      { header: 'תאריך', kind: 'date' },
      ...homes.map(h => ({ header: h, kind: 'number' as const })),
      { header: 'סה״כ ליום', kind: 'number' },
    ],
    rows: summaryRows,
    boldRows: [summaryRows.length - 1],
  }]

  const used = new Set(['סיכום'])
  for (const b of report.branches) {
    const rows: CellValue[][] = []
    for (const d of b.days) {
      d.charges.forEach((c, i) => rows.push([d.date, c.name, c.nights, c.amount, i === d.charges.length - 1 ? d.amount : null]))
    }
    rows.push([`סה״כ ${b.home}`, null, null, null, b.amount])

    let name = b.home.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 28) || 'סניף'
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 26)} ${i}`
    used.add(name)
    sheets.push({
      name,
      columns: [
        { header: 'תאריך', kind: 'date' }, { header: 'שם היולדת' }, { header: 'לילות', kind: 'number' },
        { header: 'סכום (₪)', kind: 'number' }, { header: 'סה״כ ליום (₪)', kind: 'number' },
      ],
      rows,
      boldRows: [rows.length - 1],
    })
  }
  return sheets
}
