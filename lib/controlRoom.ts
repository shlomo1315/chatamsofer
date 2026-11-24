// חישובי "חדר הבקרה" בדף השיתוף של חלוקות החגים (/shared/distributions).
// כל החישובים טהורים, כדי שאפשר יהיה לבדוק אותם ב-vitest.
import { channelKeyOf, cityOf, communityOf, familyAmount, type MoneyRow } from './sharedBoard'

export type CrRow = MoneyRow & {
  id: string
  card_linked_at?: string | null
  /** הטלפון שממנו נרשמו (בשלוחה), כשאין טלפון בכרטסת. */
  phone?: string | null
  beneficiary?: (MoneyRow['beneficiary'] & {
    family_name?: string | null; full_name?: string | null; spouse_name?: string | null
    phone?: string | null; phone2?: string | null; address?: string | null
  }) | null
}

/** הסינון של הדף: ערך אחד לכל ממד, null = בלי סינון. */
export type CrFilter = { comm: string | null; city: string | null; ch: string | null; hour: number | null }
export type CrKey = keyof CrFilter
export const CR_KEYS: CrKey[] = ['comm', 'city', 'ch', 'hour']
export const CR_EMPTY: CrFilter = { comm: null, city: null, ch: null, hour: null }
export const CR_NAMES: Record<CrKey, string> = { comm: 'קהילה', city: 'עיר', ch: 'ערוץ', hour: 'שעה' }

/** הערוצים בסדר ובתוויות של המוקאפ. 'none' מוצג רק כשיש רשומות בלי ערוץ. */
export const CR_CHANNELS: [string, string][] = [
  ['phone', 'טלפון'], ['digital', 'ממשק דיגיטלי'], ['email', 'מייל'], ['manual', 'הזנה ידנית'],
]
export const NO_CHANNEL: [string, string] = ['none', 'לא תועד']
export const channelLabel = (k: string) => (CR_CHANNELS.find(c => c[0] === k) ?? NO_CHANNEL)[1]

const hourOf = (r: CrRow) => {
  const t = r.registered_at ? new Date(r.registered_at) : null
  return t && !Number.isNaN(t.getTime()) ? t.getHours() : null
}

/** הערך של השורה בממד מסוים. */
export function dimOf(r: CrRow, k: CrKey): string | number | null {
  if (k === 'comm') return communityOf(r)
  if (k === 'city') return cityOf(r) || null
  if (k === 'ch') return channelKeyOf(r.source)
  return hourOf(r)
}

/** השורות אחרי הסינון. skip = הממד שהגרף עצמו מציג, ולכן הוא מתעלם ממנו. */
export function subRows<T extends CrRow>(rows: T[], f: CrFilter, skip?: CrKey): T[] {
  const on = CR_KEYS.filter(k => k !== skip && f[k] != null)
  if (!on.length) return rows
  return rows.filter(r => on.every(k => dimOf(r, k) === f[k]))
}

/** לחיצה על ערך: בוחרת אותו, ולחיצה שנייה על אותו ערך מבטלת. */
export function toggleF(f: CrFilter, k: CrKey, v: string | number): CrFilter {
  return { ...f, [k]: f[k] === v ? null : v }
}

/** '' בלי סינון בממד, 'sel' לערך הנבחר, 'dim' לשאר. */
export function stLevel(f: CrFilter, k: CrKey, v: string | number): '' | 'sel' | 'dim' {
  return f[k] == null ? '' : f[k] === v ? 'sel' : 'dim'
}

export const num = (n: number) => Math.round(n).toLocaleString('en-US')
export const shekel = (n: number) => '₪' + num(n)
export const pad2 = (h: number) => String(h).padStart(2, '0')

const startOfDay = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }

/** המחוונים: משפחות, סך הכול, ממוצע, מאושר מול ממתין, ונרשמים מחצות. */
export function kpis(rows: CrRow[], perFamily: number | null | undefined, now = Date.now()) {
  let sum = 0, approved = 0, kids = 0, today = 0
  const from = startOfDay(now)
  for (const r of rows) {
    const a = familyAmount(r, perFamily)
    sum += a
    if (r.approval_status === 'approved') approved += a
    kids += Number(r.beneficiary?.children_count ?? 0) || 0
    const t = r.registered_at ? Date.parse(r.registered_at) : NaN
    if (t >= from) today++
  }
  const n = rows.length
  return { n, sum, approved, pending: sum - approved, avg: n ? sum / n : 0, kidsAvg: n ? kids / n : 0, today }
}

export type CommMoney = { label: string; value: number; pending: number; count: number }

/** כסף לפי קהילה, מהגבוה לנמוך. pending = הכסף של מי שעוד לא אושר. */
export function communityMoney(rows: CrRow[], perFamily?: number | null): CommMoney[] {
  const m = new Map<string, CommMoney>()
  for (const r of rows) {
    const k = communityOf(r)
    const x = m.get(k) ?? { label: k, value: 0, pending: 0, count: 0 }
    const a = familyAmount(r, perFamily)
    x.value += a
    x.count++
    if (r.approval_status !== 'approved') x.pending += a
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => b.value - a.value || b.count - a.count)
}

/** כמה קהילות מוצגות בדף השיתוף. השאר מסוכמות בשורה אחת. */
export const COMM_TOP = 10

/** הקהילות המובילות, וסיכום של כל השאר (כמה קהילות, כמה משפחות וכמה כסף). */
export function topCommunities(list: CommMoney[], n = COMM_TOP): { top: CommMoney[]; rest: { communities: number; count: number; value: number } } {
  const rest = list.slice(n)
  return {
    top: list.slice(0, n),
    rest: { communities: rest.length, count: rest.reduce((s, x) => s + x.count, 0), value: rest.reduce((s, x) => s + x.value, 0) },
  }
}

/** השם המלא של הנרשם, ואם אין: "משפחת X". */
export function regName(r: CrRow): string {
  return r.beneficiary?.full_name?.trim() || famLabel(r)
}

export type RegRow = {
  id: string; name: string; spouse: string; phones: string; address: string; city: string; comm: string
  kids: number | null; amount: number; status: 'approved' | 'pending' | 'rejected'; channel: string; at: string | null
}
export const REG_STATUS: Record<RegRow['status'], string> = { approved: 'מאושר', pending: 'ממתין', rejected: 'נדחה' }

/** סדר הטבלה: החדש ראשון, ומי שאין לו שעת רישום בסוף (מיון יציב). */
export function regOrder<T extends CrRow>(rows: T[]): T[] {
  const t = (r: CrRow) => (r.registered_at ? Date.parse(r.registered_at) || 0 : 0)
  return [...rows].sort((a, b) => t(b) - t(a))
}

/** טבלת הנרשמים: כל פרטי המשפחה שנשלחים לדף, החדש ראשון, ומי שאין לו שעת רישום בסוף.
 *  שדה שאין בו ערך נשאר ריק (לא ממציאים). */
export function regTable<T extends CrRow>(rows: T[], perFamily?: number | null): RegRow[] {
  return regOrder(rows).map(r => {
    const b = r.beneficiary
    const phones = [...new Set([b?.phone, b?.phone2, r.phone].map(p => p?.trim()).filter(Boolean))].join(' · ')
    const kids = b?.children_count
    return {
      id: r.id, name: regName(r), spouse: b?.spouse_name?.trim() || '', phones,
      address: b?.address?.trim() || '', city: cityOf(r), comm: communityOf(r),
      kids: kids == null ? null : Number(kids), amount: familyAmount(r, perFamily),
      status: r.approval_status === 'approved' ? 'approved' : r.approval_status === 'rejected' ? 'rejected' : 'pending',
      channel: channelLabel(channelKeyOf(r.source)), at: r.registered_at ?? null,
    }
  })
}

/** ספירת רישומים לכל ערוץ, בסדר של המוקאפ. */
export function channelCounts(rows: CrRow[]): { key: string; label: string; count: number }[] {
  const c: Record<string, number> = {}
  for (const r of rows) { const k = channelKeyOf(r.source); c[k] = (c[k] ?? 0) + 1 }
  const list = CR_CHANNELS.map(([key, label]) => ({ key, label, count: c[key] ?? 0 }))
  if (c.none) list.push({ key: NO_CHANNEL[0], label: NO_CHANNEL[1], count: c.none })
  return list
}

/** הערים המובילות לפי מספר משפחות. ערים ריקות לא נספרות. */
export function cityTop(rows: CrRow[], n = 6): { label: string; count: number }[] {
  const c = new Map<string, number>()
  for (const r of rows) { const k = cityOf(r); if (k) c.set(k, (c.get(k) ?? 0) + 1) }
  return [...c.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'he')).slice(0, n)
}

/** 24 ספירות לפי שעת הרישום. */
export function hourCountsCr(rows: CrRow[]): number[] {
  const out = Array<number>(24).fill(0)
  for (const r of rows) { const h = hourOf(r); if (h != null) out[h]++ }
  return out
}

/** 60 דליים של 15 שניות (15 הדקות האחרונות). האחרון = עכשיו. */
export function rateBuckets(rows: CrRow[], now = Date.now(), n = 60, step = 15_000): number[] {
  const out = Array<number>(n).fill(0)
  const from = now - n * step
  for (const r of rows) {
    const t = r.registered_at ? Date.parse(r.registered_at) : NaN
    if (!(t > from && t <= now)) continue
    out[Math.min(n - 1, Math.floor((t - from) / step))]++
  }
  return out
}

/** נרשמים בדקה האחרונה = ארבעת הדליים האחרונים. */
export const ratePerMinute = (b: number[]) => b.slice(-4).reduce((s, x) => s + x, 0)

/** הקו של גרף הקצב, באותן נוסחאות של המוקאפ (viewBox 600×110). */
export function sparkPoints(b: number[]): [string, string][] {
  const bm = Math.max(6, ...b)
  const last = Math.max(1, b.length - 1)
  return b.map((v, i) => [(i / last * 600).toFixed(1), (104 - v / bm * 92).toFixed(1)])
}

/** נרשמו, הגיעו לאסוף (אושרו וקיבלו כרטיס), ממתינים לאיסוף (אושרו ועוד לא). */
export function pickup(rows: CrRow[]) {
  let approved = 0, arrived = 0
  for (const r of rows) {
    if (r.approval_status !== 'approved') continue
    approved++
    if (r.card_linked_at) arrived++
  }
  return { registered: rows.length, arrived, waiting: approved - arrived }
}

/** השורות שלא היו ברענון הקודם, מהחדשה לישנה. */
export function freshIds<T extends CrRow>(prev: Set<string>, rows: T[]): T[] {
  return rows.filter(r => !prev.has(r.id))
    .sort((a, b) => (Date.parse(b.registered_at ?? '') || 0) - (Date.parse(a.registered_at ?? '') || 0))
}

/**
 * נרשמים חדשים מול כל מה שכבר נראה בחלוקה הזו (לא רק ברענון הקודם), ומוסיף אותם ל-seen.
 * ⚠️ כך שורה שנעלמה לרענון אחד וחזרה לא קופצת שוב כ"נרשמה עכשיו".
 */
export function takeFresh<T extends CrRow>(seen: Set<string>, rows: T[]): T[] {
  const fresh = freshIds(seen, rows)
  for (const r of fresh) seen.add(r.id)
  return fresh
}

/** הרענון האחרון שהצליח ישן משלושה רענונים: הדף לא מקבל נתונים חדשים. */
export const isStale = (updatedAt: Date | null, now: number, ms = 45_000) => !!updatedAt && now - updatedAt.getTime() > ms

/** "משפחת X" לפי שם המשפחה, ואם חסר, המילה האחרונה בשם המלא. */
export function famLabel(r: CrRow): string {
  const fam = r.beneficiary?.family_name?.trim() || r.beneficiary?.full_name?.trim().split(/\s+/).pop() || ''
  return fam ? `משפחת ${fam}` : 'משפחה חדשה'
}

/** השורות האחרונות שנרשמו, לפיד. */
export function latest<T extends CrRow>(rows: T[], n = 4): T[] {
  return [...rows].filter(r => r.registered_at)
    .sort((a, b) => Date.parse(b.registered_at!) - Date.parse(a.registered_at!)).slice(0, n)
}
