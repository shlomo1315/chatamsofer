import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { recoveryDaysOf } from '@/lib/maternity'

// ─────────────────────────────────────────────────────────────────────────────
// דוח יולדות לנדיב: יולדות שאושרו (status='active'), לפי בית החלמה, תאריך וסכום.
//
// 🔴 הדף ציבורי (מי שמחזיק בקישור), ולכן נחשפים רק שם היולדת, בית ההחלמה, עיר, קהילה,
// תאריך, לילות, סוג לידה, סכום וארבע ספרות אחרונות של ת.ז. (כמו במוקאפ המאושר).
// בלי ת.ז. מלאה, טלפון, כתובת או שם התינוק. חיפוש לפי ת.ז. מלאה נעשה בשרת בלבד.
//
// ⚠️ תאריך השורה: תאריך ההגעה לבית ההחלמה, ואם אין — תאריך הלידה.
// ⚠️ סכום: סך הקבלות של בית ההחלמה; אם אין קבלות — recovery_amount
// (אותה לוגיקה כמו דוח המימוש).
// ─────────────────────────────────────────────────────────────────────────────

export interface DonorRow {
  id: string
  name: string
  home: string
  /** YYYY-MM-DD, או ריק אם אין תאריך. */
  date: string
  amount: number
  /** הסבר לשורה בלי סכום (במקום ₪0), או null כשיש סכום. */
  note: string | null
  /** עיר וקהילה; 'לא צוין' כשחסר. */
  city: string
  community: string
  /** 1 לידה רגילה · 2 תאומים · 3 שלישייה (ויותר). */
  kind: 1 | 2 | 3
  /** לילות בפועל בבית ההחלמה (recovery_nights), או null כשטרם הוזן. */
  nights: number | null
  /** לילות הזכאות, כשאין עדיין לילות בפועל. */
  eligibleNights: number
  /** הגיעה לבית ההחלמה (recovery_arrived). */
  arrived: boolean
  /** ארבע ספרות אחרונות של ת.ז. (למסכה), או ריק. */
  idLast4: string
}

/** שורה מלאה בשרת בלבד: כוללת ת.ז. לחיפוש. לעולם לא נשלחת ללקוח. */
export type DonorRowFull = DonorRow & { idNumber: string }

export const UNKNOWN_LABEL = 'לא צוין'

export function birthKind(isTwins: boolean | null | undefined, babiesCount: number): 1 | 2 | 3 {
  if (babiesCount >= 3) return 3
  if (isTwins || babiesCount === 2) return 2
  return 1
}

/** התאמת ת.ז. לחיפוש: ספרות בלבד, לפחות 4. */
export function digitsQuery(q: string): string {
  const d = q.replace(/[\s-]/g, '')
  return /^\d{4,}$/.test(d) ? d : ''
}

/**
 * שורה בלי סכום לא מוצגת כ-₪0. כל השורות בדוח ביקשו בית החלמה (recovery_home),
 * ולכן: הגיעה בלי סכום שהוזן → הסכום טרם הוזן; אחרת → טרם מימשה את הזכות.
 */
export function amountNote(amount: number, arrived: boolean): string | null {
  if (amount > 0) return null
  return arrived
    ? 'היולדת הגיעה לבית ההחלמה, הסכום טרם הוזן'
    : 'היולדת עדיין לא מימשה את הזכות שלה בבית ההחלמה, אמורה להגיע בימים הקרובים'
}

export interface DonorFilter {
  from?: string | null
  to?: string | null
  home?: string | null
}

export interface DonorLink {
  id: string
  token: string
  label: string
  recovery_home: string | null
  revoked_at: string | null
  password_hash: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function cleanDate(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!DATE_RE.test(s)) return null
  return Number.isNaN(Date.parse(s)) ? null : s
}

export function generateDonorToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 43 תווים של base64url — כל דבר אחר נדחה בלי לגשת למסד. */
export function isWellFormedDonorToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
}

/**
 * הסינון האפקטיבי: בית ההחלמה הנעול בקישור גובר תמיד על הבקשה מהדפדפן.
 * 🔴 כך נדיב עם קישור נעול לא יכול לראות בית אחר ע"י שינוי הפרמטר.
 */
export function effectiveFilter(link: Pick<DonorLink, 'recovery_home'>, req: DonorFilter): DonorFilter {
  const locked = (link.recovery_home ?? '').trim()
  return {
    from: cleanDate(req.from),
    to: cleanDate(req.to),
    home: locked || (req.home ?? '').trim() || null,
  }
}

export function filterRows<T extends DonorRow>(rows: T[], f: DonorFilter): T[] {
  return rows.filter(r => {
    if (f.home && r.home !== f.home) return false
    // שורה בלי תאריך אינה נכנסת לטווח מוגדר: אי אפשר לדעת אם היא בו.
    if ((f.from || f.to) && !r.date) return false
    if (f.from && r.date < f.from) return false
    if (f.to && r.date > f.to) return false
    return true
  })
}

export function summarize(rows: DonorRow[]) {
  const homes = new Map<string, { home: string; count: number; amount: number }>()
  let amount = 0
  for (const r of rows) {
    amount += r.amount
    const h = homes.get(r.home) ?? { home: r.home, count: 0, amount: 0 }
    h.count++
    h.amount += r.amount
    homes.set(r.home, h)
  }
  return {
    count: rows.length,
    amount,
    homes: [...homes.values()].sort((a, b) => b.amount - a.amount),
  }
}

/** שליפת כל היולדות שאושרו עם בית החלמה. */
export async function loadApprovedRows(db: SupabaseClient): Promise<DonorRowFull[]> {
  const { rows: aids, error } = await fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('maternity_aids')
    .select('id, birth_date, recovery_home, recovery_arrived, recovery_arrived_at, recovery_amount, recovery_nights, recovery_eligibility_days, is_twins, babies, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, city, community_affiliation)')
    .eq('status', 'active')
    .not('recovery_home', 'is', null)
    .range(from, to))
  if (error) throw new Error('שליפת היולדות נכשלה')

  const { rows: receipts, error: rErr } = await fetchAllRows<{ aid_id: string; amount?: number | null }>((from, to) => db
    .from('recovery_receipts').select('aid_id, amount').range(from, to))
  if (rErr) throw new Error('שליפת הקבלות נכשלה')

  const byAid = new Map<string, { count: number; amount: number }>()
  for (const r of receipts) {
    const cur = byAid.get(r.aid_id) ?? { count: 0, amount: 0 }
    cur.count++
    cur.amount += Number(r.amount ?? 0) || 0
    byAid.set(r.aid_id, cur)
  }

  const out: DonorRowFull[] = []
  for (const a of aids) {
    const home = String(a.recovery_home ?? '').trim()
    if (!home) continue
    const rec = byAid.get(String(a.id))
    const amount = rec && rec.count > 0 ? rec.amount : (Number(a.recovery_amount ?? 0) || 0)
    const b = a.beneficiary as { full_name?: string | null; family_name?: string | null; spouse_name?: string | null; id_number?: string | null; city?: string | null; community_affiliation?: string | null } | null
    const name = [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '—'
    const date = String(a.recovery_arrived_at ?? a.birth_date ?? '').slice(0, 10)
    const idNumber = String(b?.id_number ?? '').replace(/\D/g, '')
    const babiesCount = Array.isArray(a.babies) ? a.babies.length : 0
    const nights = Number(a.recovery_nights ?? 0) || 0
    out.push({
      id: String(a.id), name, home, date: DATE_RE.test(date) ? date : '', amount,
      note: amountNote(amount, a.recovery_arrived === true),
      city: String(b?.city ?? '').trim() || UNKNOWN_LABEL,
      community: String(b?.community_affiliation ?? '').trim() || UNKNOWN_LABEL,
      kind: birthKind(a.is_twins as boolean | null, babiesCount),
      nights: nights > 0 ? nights : null,
      eligibleNights: recoveryDaysOf({ recovery_eligibility_days: a.recovery_eligibility_days as number | null, is_twins: a.is_twins as boolean | null }),
      arrived: a.recovery_arrived === true,
      idLast4: idNumber.slice(-4),
      idNumber,
    })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

/** מחזיר את הקישור אם הטוקן קיים ולא בוטל, אחרת null. */
export async function resolveDonorLink(db: SupabaseClient, token: unknown): Promise<DonorLink | null> {
  if (!isWellFormedDonorToken(token)) return null
  const { data } = await db
    .from('donor_report_links')
    .select('id, token, label, recovery_home, revoked_at, password_hash')
    .eq('token', token)
    .maybeSingle()
  const link = data as DonorLink | null
  if (!link || link.revoked_at) return null
  return link
}
