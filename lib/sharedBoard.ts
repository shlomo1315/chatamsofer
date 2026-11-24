// ─────────────────────────────────────────────────────────────────────────────
// חישובי הגרפים של דף השיתוף (עיצוב ב׳ · לוח). פונקציות טהורות בלבד:
// מקבלות את הנתונים שכבר נטענו ומחזירות מספרים ונתיבי SVG. בלי React ובלי
// שליפות, כדי שאפשר יהיה לבדוק אותן בנפרד.
// ─────────────────────────────────────────────────────────────────────────────
import { registrationSourceOf } from '@/lib/distributionSources'

const DAY = 24 * 60 * 60 * 1000

/** מפתח יום מקומי (YYYY-MM-DD) — לפי שעון ישראל של הדפדפן ולא UTC. */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** רישומים לפי יום, מהיום הראשון עד האחרון (ימים בלי רישום = 0), ומצטבר. */
export function registrationSeries(rows: { registered_at?: string | null }[]) {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.registered_at || Number.isNaN(new Date(r.registered_at).getTime())) continue
    const k = dayKey(r.registered_at)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const keys = [...counts.keys()].sort()
  if (!keys.length) return { daily: [] as number[], cumulative: [] as number[] }
  const daily: number[] = []
  // ⚠️ צעד של 12 שעות ולא 24: במעבר שעון יום של 24 שעות בדיוק יכול לדלג
  // על יום או לחזור עליו. dayKey מאחד את שני הצעדים לאותו יום.
  const end = new Date(`${keys[keys.length - 1]}T12:00:00`).getTime()
  let last = ''
  for (let t = new Date(`${keys[0]}T12:00:00`).getTime(); t <= end + DAY / 4; t += DAY / 2) {
    const k = dayKey(new Date(t).toISOString())
    if (k === last) continue
    last = k
    daily.push(counts.get(k) ?? 0)
  }
  const cumulative: number[] = []
  daily.reduce((s, n) => { cumulative.push(s + n); return s + n }, 0)
  return { daily, cumulative }
}

/** נתיבי קו ושטח לגרף מצטבר (viewBox 0 0 w h, נמתח לרוחב הפאנל). */
export function areaPaths(values: number[], w = 600, h = 170, pad = 8) {
  if (!values.length) return { line: '', area: '' }
  const vs = values.length === 1 ? [values[0], values[0]] : values
  const max = Math.max(...vs) || 1
  const pts = vs.map((v, i) => {
    const x = (i / (vs.length - 1)) * w
    const y = h - pad - (v / max) * (h - pad * 2)
    return `${round(x)},${round(y)}`
  })
  const line = `M${pts.join(' L')}`
  return { line, area: `${line} L${w},${h} L0,${h} Z` }
}

const round = (n: number) => Math.round(n * 10) / 10

/** ארבע תוויות לציר הימים: יום 1 … יום N. */
export function dayAxis(days: number): string[] {
  if (days <= 1) return ['יום 1']
  const picks = [1, Math.round(days / 3), Math.round((2 * days) / 3), days]
  return [...new Set(picks.filter(n => n >= 1))].map(n => `יום ${n}`)
}

export type Channel = { key: string; label: string; count: number; pct: number; color: string }

const CHANNELS = [
  { key: 'phone', label: 'טלפון', color: 'var(--c1)' },
  { key: 'digital', label: 'ממשק דיגיטלי', color: 'var(--c2)' },
  { key: 'email', label: 'מייל', color: 'var(--c3)' },
  { key: 'manual', label: 'הזנה ידנית', color: 'var(--c4)' },
] as const

/** פילוח לפי ערוץ רישום. נדרים נספר כדיגיטלי; ערוץ שלא תועד — שורה נפרדת. */
export function channelShares(rows: { source?: string | null }[]): Channel[] {
  const c: Record<string, number> = { phone: 0, digital: 0, email: 0, manual: 0, none: 0 }
  for (const r of rows) {
    const s = registrationSourceOf(r.source)
    if (s === 'phone') c.phone++
    else if (s === 'portal' || s === 'nedarim') c.digital++
    else if (s === 'email') c.email++
    else if (s === 'admin') c.manual++
    else c.none++
  }
  const total = rows.length || 1
  const out: Channel[] = CHANNELS.map(ch => ({ ...ch, count: c[ch.key], pct: (c[ch.key] / total) * 100 }))
  if (c.none) out.push({ key: 'none', label: 'לא תועד', count: c.none, pct: (c.none / total) * 100, color: 'var(--line)' })
  return out
}

/** רקע conic-gradient לטבעת, לפי סדר הערוצים. */
export function conicOf(parts: { pct: number; color: string }[]): string {
  if (!parts.some(p => p.pct > 0)) return 'conic-gradient(var(--track) 0 100%)'
  let acc = 0
  const stops = parts.map(p => {
    acc += p.pct
    return `${p.color} 0 ${round(acc)}%`
  })
  return `conic-gradient(${stops.join(',')})`
}

export type Bar = { label: string; value: number }

/** ספירה לפי מפתח, מהגדול לקטן. ערך ריק לא נספר. */
export function topCounts<T>(rows: T[], keyOf: (r: T) => string | null | undefined, n = 6): Bar[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = String(keyOf(r) ?? '').trim()
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value).slice(0, n)
}

/** ארבעה דליים של מספר ילדים: 0–2, 3–5, 6–8, 9+. */
export function kidsBuckets(rows: { children_count?: number | null }[]): Bar[] {
  const b = [0, 0, 0, 0]
  for (const r of rows) {
    if (r.children_count == null) continue
    const n = Number(r.children_count)
    b[n >= 9 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0]++
  }
  return ['0–2', '3–5', '6–8', '9+'].map((label, i) => ({ label, value: b[i] }))
}

/** רוחב/גובה יחסי באחוזים (לפס של 100%). */
export const pctOf = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 1000) / 10 : 0)

// ── עזר יולדות ──
export type MatLike = {
  birth_date?: string | null
  recovery_home?: string | null
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string | null
  recovery_nights?: number | null
  recovery_amount?: number | null
  receiptCount?: number | null
}

const billedOf = (r: MatLike) => (r.receiptCount ?? 0) > 0
const amountOf = (r: MatLike) => Number(r.recovery_amount ?? 0) || 0

/** מלידה ועד תשלום: נולדו → הגיעו לבית החלמה → חויבו (יש קבלה). */
export function maternityFunnel(rows: MatLike[]) {
  const arrived = rows.filter(r => r.recovery_arrived === true)
  const billed = arrived.filter(billedOf)
  return {
    born: rows.length,
    arrived: arrived.length,
    billed: billed.length,
    paid: billed.reduce((s, r) => s + amountOf(r), 0),
    waiting: arrived.length - billed.length,
  }
}

/** לידות מתקופה (לפי תאריך הלידה). months=null — הכול. */
export function inPeriod<T extends MatLike>(rows: T[], months: number | null, now = new Date()): T[] {
  if (months == null) return rows
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).getTime()
  return rows.filter(r => r.birth_date && new Date(r.birth_date).getTime() >= from)
}

export type HomeRow = { home: string; arrived: number; nights: number; paid: number; unbilled: number }

/** סיכום לכל בית החלמה, מהסכום ששולם הגבוה לנמוך. */
export function byRecoveryHome(rows: MatLike[]): HomeRow[] {
  const m = new Map<string, HomeRow>()
  for (const r of rows) {
    const home = String(r.recovery_home ?? '').trim()
    if (!home) continue
    const h = m.get(home) ?? { home, arrived: 0, nights: 0, paid: 0, unbilled: 0 }
    if (r.recovery_arrived === true) {
      h.arrived++
      h.nights += Number(r.recovery_nights ?? 0) || 0
      if (billedOf(r)) h.paid += amountOf(r)
      else h.unbilled++
    }
    m.set(home, h)
  }
  return [...m.values()].sort((a, b) => b.paid - a.paid || b.arrived - a.arrived)
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/**
 * ₪ ששולם לפי חודש, בשישה החודשים האחרונים.
 * ⚠️ לקבלה אין תאריך משלה, ולכן החודש הוא חודש ההגעה לבית ההחלמה
 * (recovery_arrived_at), והסכום נספר רק כשיש קבלה.
 */
export function paidByMonth(rows: MatLike[], now = new Date(), months = 6): Bar[] {
  const out = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
    return { y: d.getFullYear(), m: d.getMonth(), value: 0 }
  })
  for (const r of rows) {
    if (!billedOf(r) || !r.recovery_arrived_at) continue
    const d = new Date(r.recovery_arrived_at)
    const slot = out.find(o => o.y === d.getFullYear() && o.m === d.getMonth())
    if (slot) slot.value += amountOf(r)
  }
  return out.map(o => ({ label: HE_MONTHS[o.m], value: o.value }))
}

// ── צאצאים ──
/** מספר הצמתים בכל דור, לפי סדר הדורות. */
export function generationCounts(nodes: { generation: number }[]): { generation: number; count: number }[] {
  const m = new Map<number, number>()
  for (const n of nodes) {
    const g = Number(n.generation)
    if (Number.isFinite(g) && g > 0) m.set(g, (m.get(g) ?? 0) + 1)
  }
  return [...m.entries()].map(([generation, count]) => ({ generation, count }))
    .sort((a, b) => a.generation - b.generation)
}

export type Ring = { generation: number; r: number; width: number; dash: number; opacity: number }

/**
 * טבעות מניפת הדורות (viewBox 0 0 400 214, מרכז 200,206). כל דור אחרי הראשון
 * הוא טבעת; הטבעת מחולקת למקטעים לפי מספר הצאצאים (עם תקרה, כדי שלא תהפוך
 * לקו רציף), והשקיפות לפי היחס לדור הגדול ביותר. הדור הראשון — חצי העיגול במרכז.
 */
export function fanRings(counts: { generation: number; count: number }[], cap = 72): Ring[] {
  const rings = counts.filter(c => c.generation > 1)
  if (!rings.length) return []
  const max = Math.max(...rings.map(c => c.count)) || 1
  const step = rings.length > 1 ? (166 - 62) / (rings.length - 1) : 0
  const width = rings.length > 1 ? Math.min(22, Math.max(4, step - 4)) : 22
  return rings.map((c, i) => {
    const r = round(62 + step * i)
    const n = Math.max(1, Math.min(cap, c.count))
    return {
      generation: c.generation,
      r,
      width: round(width),
      dash: Math.max(1, round((Math.PI * r) / n - 2)),
      opacity: Math.round((0.3 + 0.55 * (c.count / max)) * 100) / 100,
    }
  })
}

// ── מחוני כסף, פילוח לפי קהילות וסינון (דף חלוקות החגים) ──

export type MoneyRow = {
  amount?: number | null
  approval_status?: string | null
  source?: string | null
  registered_at?: string | null
  beneficiary?: { community_affiliation?: string | null; city?: string | null; children_count?: number | null } | null
}

export const NO_COMMUNITY = 'לא צוין'

/** עיר המשפחה ('' כשלא צוינה). */
export const cityOf = (r: MoneyRow) => r.beneficiary?.city?.trim() || ''

export const KIDS_BUCKETS = ['0–2', '3–5', '6–8', '9+'] as const

/** הדלי של מספר הילדים, באותה חלוקה כמו kidsBuckets. null כשלא צוין. */
export function kidsBucketOf(n?: number | null): string | null {
  if (n == null) return null
  const k = Number(n)
  return KIDS_BUCKETS[k >= 9 ? 3 : k >= 6 ? 2 : k >= 3 ? 1 : 0]
}

export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const validDate = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** מספר הרישומים בכל שעה ביממה (24 ערכים, שעון מקומי). */
export function hourCounts(rows: { registered_at?: string | null }[]): number[] {
  const out = Array<number>(24).fill(0)
  for (const r of rows) {
    const d = validDate(r.registered_at)
    if (d) out[d.getHours()]++
  }
  return out
}

/** מפת חום: [יום בשבוע 0=ראשון][שעה 0–23]. */
export function weekdayHourMatrix(rows: { registered_at?: string | null }[]): number[][] {
  const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const r of rows) {
    const d = validDate(r.registered_at)
    if (d) m[d.getDay()][d.getHours()]++
  }
  return m
}

const HOUR = 3_600_000

/**
 * רישומים לפי שעה, מהשעה הראשונה עד האחרונה (שעות ריקות = 0), ומצטבר.
 * מוגבל ל-`max` השעות האחרונות, כדי שהגרף יישאר קריא.
 */
export function hourlySeries(rows: { registered_at?: string | null }[], max = 24 * 14) {
  const counts = new Map<number, number>()
  for (const r of rows) {
    const d = validDate(r.registered_at)
    if (!d) continue
    const k = Math.floor(d.getTime() / HOUR)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  if (!counts.size) return { daily: [] as number[], cumulative: [] as number[], start: null as number | null }
  const keys = [...counts.keys()]
  const last = Math.max(...keys)
  const first = Math.max(Math.min(...keys), last - max + 1)
  let before = 0
  for (const [k, n] of counts) if (k < first) before += n
  const daily: number[] = []
  for (let k = first; k <= last; k++) daily.push(counts.get(k) ?? 0)
  const cumulative: number[] = []
  daily.reduce((s, n) => { cumulative.push(s + n); return s + n }, before)
  return { daily, cumulative, start: first * HOUR }
}

/** קהילת המשפחה; משפחה בלי קהילה נספרת תחת "לא צוין". */
export const communityOf = (r: MoneyRow) => r.beneficiary?.community_affiliation?.trim() || NO_COMMUNITY

/** מפתח ערוץ הרישום, באותה חלוקה כמו channelShares. */
export function channelKeyOf(source?: string | null): string {
  const s = registrationSourceOf(source)
  if (s === 'phone') return 'phone'
  if (s === 'portal' || s === 'nedarim') return 'digital'
  if (s === 'email') return 'email'
  if (s === 'admin') return 'manual'
  return 'none'
}

/**
 * הסכום של משפחה בחלוקה. ⚠️ סכום שנקבע לנרשם גובר; בלעדיו — הסכום הקבוע
 * לכל משפחה בחלוקה. נדחה לא מקבל כסף ולכן נספר כ-0.
 */
export function familyAmount(r: MoneyRow, perFamily?: number | null): number {
  if (r.approval_status === 'rejected') return 0
  const own = Number(r.amount ?? 0)
  return own > 0 ? own : Number(perFamily ?? 0) || 0
}

export type MoneyFilter = {
  communities: string[]   // ריק = כל הקהילות
  status: string          // '' = הכול
  channel: string         // '' = הכול
  from: string            // YYYY-MM-DD או ''
  to: string              // YYYY-MM-DD או ''
  minAmount: number | null
  maxAmount: number | null
  cities: string[]        // ריק = כל הערים
  kids: string[]          // דליים מ-KIDS_BUCKETS; ריק = הכול
  hours: number[]         // 0–23; ריק = כל השעות
  weekdays: number[]      // 0=ראשון; ריק = כל הימים
}

export const EMPTY_FILTER: MoneyFilter = {
  communities: [], status: '', channel: '', from: '', to: '', minAmount: null, maxAmount: null,
  cities: [], kids: [], hours: [], weekdays: [],
}

export const isFiltered = (f: MoneyFilter) => JSON.stringify(f) !== JSON.stringify(EMPTY_FILTER)

/** מוסיף ערך לרשימה או מסיר אותו אם כבר קיים. */
export const toggleIn = <V>(list: V[], v: V): V[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

export function filterMoneyRows<T extends MoneyRow>(rows: T[], f: MoneyFilter, perFamily?: number | null): T[] {
  return rows.filter(r => {
    if (f.communities.length && !f.communities.includes(communityOf(r))) return false
    if (f.cities.length && !f.cities.includes(cityOf(r))) return false
    if (f.kids.length && !f.kids.includes(kidsBucketOf(r.beneficiary?.children_count) ?? '')) return false
    if (f.status && (r.approval_status || 'pending') !== f.status) return false
    if (f.channel && channelKeyOf(r.source) !== f.channel) return false
    if (f.from || f.to || f.hours.length || f.weekdays.length) {
      const dt = validDate(r.registered_at)
      if (!dt) return false
      const d = dayKey(r.registered_at!)
      if (f.from && d < f.from) return false
      if (f.to && d > f.to) return false
      if (f.hours.length && !f.hours.includes(dt.getHours())) return false
      if (f.weekdays.length && !f.weekdays.includes(dt.getDay())) return false
    }
    const a = familyAmount(r, perFamily)
    if (f.minAmount != null && a < f.minAmount) return false
    if (f.maxAmount != null && a > f.maxAmount) return false
    return true
  })
}

export function moneySummary(rows: MoneyRow[], perFamily?: number | null) {
  let total = 0, approved = 0, pending = 0, paying = 0
  for (const r of rows) {
    const a = familyAmount(r, perFamily)
    total += a
    if (a > 0) paying++
    if (r.approval_status === 'approved') approved += a
    else if (r.approval_status !== 'rejected') pending += a
  }
  return { total, approved, pending, families: rows.length, avg: paying ? total / paying : 0 }
}

export type CommunityMoney = { label: string; value: number; count: number }

/** סכום ומספר משפחות לכל קהילה, מהגבוה לנמוך. */
export function moneyByCommunity(rows: MoneyRow[], perFamily?: number | null): CommunityMoney[] {
  const m = new Map<string, CommunityMoney>()
  for (const r of rows) {
    const k = communityOf(r)
    const e = m.get(k) ?? { label: k, value: 0, count: 0 }
    e.value += familyAmount(r, perFamily)
    e.count++
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => b.value - a.value || b.count - a.count)
}

/** החלקים של שעון העצר עד `target`. done כשהמועד עבר (או לא תקין). */
export function countdownParts(target: string | null | undefined, now = Date.now()) {
  const t = target ? Date.parse(target) : NaN
  if (Number.isNaN(t)) return null
  const left = Math.max(0, Math.floor((t - now) / 1000))
  return {
    done: left === 0,
    days: Math.floor(left / 86400),
    hours: Math.floor((left % 86400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
  }
}
