import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// מעקב אשראי לנדיב: יולדות שאושרו (status='active'), לפי בית החלמה, תאריך וסכום.
//
// 🔴 הדף ציבורי (מי שמחזיק בקישור), ולכן נחשפים רק שם היולדת, בית ההחלמה,
// תאריך וסכום. בלי ת.ז., טלפון, כתובת או שם התינוק.
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

export function filterRows(rows: DonorRow[], f: DonorFilter): DonorRow[] {
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
export async function loadApprovedRows(db: SupabaseClient): Promise<DonorRow[]> {
  const { rows: aids, error } = await fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('maternity_aids')
    .select('id, birth_date, recovery_home, recovery_arrived_at, recovery_amount, beneficiary:beneficiaries(full_name, family_name, spouse_name)')
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

  const out: DonorRow[] = []
  for (const a of aids) {
    const home = String(a.recovery_home ?? '').trim()
    if (!home) continue
    const rec = byAid.get(String(a.id))
    const amount = rec && rec.count > 0 ? rec.amount : (Number(a.recovery_amount ?? 0) || 0)
    const b = a.beneficiary as { full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
    const name = [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '—'
    const date = String(a.recovery_arrived_at ?? a.birth_date ?? '').slice(0, 10)
    out.push({ id: String(a.id), name, home, date: DATE_RE.test(date) ? date : '', amount })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

/** מחזיר את הקישור אם הטוקן קיים ולא בוטל, אחרת null. */
export async function resolveDonorLink(db: SupabaseClient, token: unknown): Promise<DonorLink | null> {
  if (!isWellFormedDonorToken(token)) return null
  const { data } = await db
    .from('donor_report_links')
    .select('id, token, label, recovery_home, revoked_at')
    .eq('token', token)
    .maybeSingle()
  const link = data as DonorLink | null
  if (!link || link.revoked_at) return null
  return link
}
