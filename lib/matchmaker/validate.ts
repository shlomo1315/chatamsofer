import { digitsOnly } from '@/lib/idLookup'

// ─────────────────────────────────────────────────────────────────────────────
// אימות וניקוי קלט של פורטל השדכנים. הכול רץ בשרת; הדפדפן רק מציג הודעות.
// ─────────────────────────────────────────────────────────────────────────────

/** ת"ז ישראלית: 5-9 ספרות, מרופדת ל-9, עם ספרת ביקורת תקינה. מחזיר 9 ספרות או null. */
export function normalizeIsraeliId(raw: unknown): string | null {
  const d = digitsOnly(raw)
  if (d.length < 5 || d.length > 9) return null
  const id = d.padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let n = Number(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (n > 9) n -= 9
    sum += n
  }
  return sum % 10 === 0 ? id : null
}

/** טלפון ישראלי: ספרות בלבד, מתחיל ב-0 (או 972), 9-10 ספרות. */
export function normalizePhone(raw: unknown): string | null {
  let d = digitsOnly(raw)
  if (d.startsWith('972')) d = '0' + d.slice(3)
  if (!/^0\d{8,9}$/.test(d)) return null
  return d
}

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  if (e.length > 200 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(e)) return null
  return e
}

/** טקסט חופשי קצר: מנוקה מתווי בקרה ומרווחים כפולים, עם תקרת אורך. */
export function cleanText(raw: unknown, max = 80): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** תאריך YYYY-MM-DD תקין, או null. */
export function cleanDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null
  return s
}

export interface BankInput { bank_name: string; bank_branch: string; bank_account: string }

/** פרטי בנק: שם בנק, סניף (3-4 ספרות) וחשבון (4-12 ספרות). */
export function validateBank(body: Record<string, unknown>): { ok: true; value: BankInput } | { ok: false; error: string } {
  const bank_name = cleanText(body.bank_name, 40)
  const bank_branch = digitsOnly(body.bank_branch)
  const bank_account = digitsOnly(body.bank_account)
  if (!bank_name) return { ok: false, error: 'נא למלא שם בנק' }
  if (!/^\d{3,4}$/.test(bank_branch)) return { ok: false, error: 'מספר הסניף אינו תקין' }
  if (!/^\d{4,12}$/.test(bank_account)) return { ok: false, error: 'מספר החשבון אינו תקין' }
  return { ok: true, value: { bank_name, bank_branch, bank_account } }
}

export interface RegisterInput extends BankInput {
  first_name: string; last_name: string; id_number: string; phone: string
  email: string; address: string; city: string; birth_date: string; circle: string
}

export function validateRegister(body: Record<string, unknown>, today = new Date()): { ok: true; value: RegisterInput } | { ok: false; error: string } {
  const first_name = cleanText(body.first_name, 40)
  const last_name = cleanText(body.last_name, 40)
  if (!first_name || !last_name) return { ok: false, error: 'נא למלא שם פרטי ושם משפחה' }
  const id_number = normalizeIsraeliId(body.id_number)
  if (!id_number) return { ok: false, error: 'מספר תעודת הזהות אינו תקין' }
  const phone = normalizePhone(body.phone)
  if (!phone) return { ok: false, error: 'מספר הטלפון אינו תקין' }
  const email = normalizeEmail(body.email)
  if (!email) return { ok: false, error: 'כתובת המייל אינה תקינה' }
  const address = cleanText(body.address, 120)
  const city = cleanText(body.city, 60)
  if (!address || !city) return { ok: false, error: 'נא למלא כתובת ועיר' }
  const circle = cleanText(body.circle, 60)
  if (!circle) return { ok: false, error: 'נא למלא חוג' }
  const birth_date = cleanDate(body.birth_date)
  if (!birth_date) return { ok: false, error: 'תאריך הלידה אינו תקין' }
  const age = (today.getTime() - new Date(birth_date).getTime()) / (365.25 * 86400000)
  if (age < 16 || age > 110) return { ok: false, error: 'תאריך הלידה אינו סביר' }
  const bank = validateBank(body)
  if (!bank.ok) return bank
  return { ok: true, value: { first_name, last_name, id_number, phone, email, address, city, birth_date, circle, ...bank.value } }
}

export type Side = 'groom' | 'bride'
const SIDE_HE: Record<Side, string> = { groom: 'החתן', bride: 'הכלה' }

export interface SideInput {
  first_name: string; last_name: string
  father_name: string; father_phone: string; mother_name: string; mother_phone: string
  address: string; circle: string
  /** ת"ז, רק כשהצד סומן כצאצא החת"ס */
  id: string | null
}
export interface Reasons {
  groom_over_24: boolean; bride_over_22: boolean; orphan: Side | null
  zivush_groom: boolean; zivush_bride: boolean; medical: boolean
}
export interface SecondMatchmakerInput {
  first_name: string; last_name: string; id_number: string; phone: string
  email: string; address: string; city: string; circle: string
}
export interface ClaimInput {
  match_date: string
  groom: SideInput; bride: SideInput
  second_matchmaker: SecondMatchmakerInput | null
  reasons: Reasons
  is_grandchild: boolean; grandchild_side: 'groom' | 'bride' | 'both' | null
}

type R<T> = { ok: true; value: T } | { ok: false; error: string }

function validateSide(body: Record<string, unknown>, side: Side, needId: boolean, orphan: boolean): R<SideInput> {
  const k = (n: string) => body[`${side}_${n}`]
  const he = SIDE_HE[side]
  const first_name = cleanText(k('first_name'), 40), last_name = cleanText(k('last_name'), 40)
  if (!first_name || !last_name) return { ok: false, error: `נא למלא שם פרטי ושם משפחה של ${he}` }
  const address = cleanText(k('address'), 120), circle = cleanText(k('circle'), 60)
  if (!address) return { ok: false, error: `נא למלא כתובת של ${he}` }
  if (!circle) return { ok: false, error: `נא למלא חוג של ${he}` }
  // יתום: פרטי ההורה שנפטר אינם חובה (אם הוזנו, הם מאומתים)
  const parent = (who: 'father' | 'mother', label: string): { name: string; phone: string } | string => {
    const name = cleanText(k(`${who}_name`), 60)
    const raw = cleanText(k(`${who}_phone`), 20)
    if (!name && !raw && orphan) return { name: '', phone: '' }
    if (!name) return `נא למלא שם ${label} של ${he}`
    const phone = normalizePhone(raw)
    if (!phone) return `טלפון ${label} של ${he} אינו תקין`
    return { name, phone }
  }
  const f = parent('father', 'האב'); if (typeof f === 'string') return { ok: false, error: f }
  const m = parent('mother', 'האם'); if (typeof m === 'string') return { ok: false, error: m }
  let id: string | null = null
  if (needId) {
    id = normalizeIsraeliId(k('id'))
    if (!id) return { ok: false, error: `תעודת הזהות של ${he} נדרשת לאימות ואינה תקינה` }
  }
  return { ok: true, value: { first_name, last_name, father_name: f.name, father_phone: f.phone, mother_name: m.name, mother_phone: m.phone, address, circle, id } }
}

export function validateSecondMatchmaker(raw: unknown): R<SecondMatchmakerInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const first_name = cleanText(b.first_name, 40), last_name = cleanText(b.last_name, 40)
  if (!first_name || !last_name) return { ok: false, error: 'נא למלא שם פרטי ושם משפחה של השדכן הנוסף' }
  const id_number = normalizeIsraeliId(b.id_number)
  if (!id_number) return { ok: false, error: 'תעודת הזהות של השדכן הנוסף אינה תקינה' }
  const phone = normalizePhone(b.phone)
  if (!phone) return { ok: false, error: 'הטלפון של השדכן הנוסף אינו תקין' }
  const email = normalizeEmail(b.email)
  if (!email) return { ok: false, error: 'המייל של השדכן הנוסף אינו תקין' }
  const address = cleanText(b.address, 120), city = cleanText(b.city, 60), circle = cleanText(b.circle, 60)
  if (!address || !city) return { ok: false, error: 'נא למלא כתובת ועיר של השדכן הנוסף' }
  if (!circle) return { ok: false, error: 'נא למלא חוג של השדכן הנוסף' }
  return { ok: true, value: { first_name, last_name, id_number, phone, email, address, city, circle } }
}

export function validateClaim(body: Record<string, unknown>, today = new Date()): R<ClaimInput> {
  const match_date = cleanDate(body.match_date)
  if (!match_date) return { ok: false, error: 'תאריך השידוך אינו תקין' }
  const t = today.getTime()
  if (new Date(match_date).getTime() > t + 366 * 86400000 || new Date(match_date).getTime() < t - 5 * 366 * 86400000) {
    return { ok: false, error: 'תאריך השידוך אינו סביר' }
  }
  const r = (body.reasons && typeof body.reasons === 'object' ? body.reasons : {}) as Record<string, unknown>
  const orphanRaw = String(r.orphan ?? '')
  if (orphanRaw && orphanRaw !== 'groom' && orphanRaw !== 'bride') return { ok: false, error: 'נא לבחור יתום: חתן או כלה' }
  const reasons: Reasons = {
    groom_over_24: r.groom_over_24 === true, bride_over_22: r.bride_over_22 === true,
    orphan: orphanRaw ? (orphanRaw as Side) : null,
    zivush_groom: r.zivush_groom === true, zivush_bride: r.zivush_bride === true, medical: r.medical === true,
  }
  const is_grandchild = body.is_grandchild === true
  const side = String(body.grandchild_side ?? '')
  if (is_grandchild && !['groom', 'bride', 'both'].includes(side)) return { ok: false, error: 'נא לבחור מי נכד החתם סופר: חתן, כלה או שניהם' }
  const gc = is_grandchild ? (side as 'groom' | 'bride' | 'both') : null

  const groom = validateSide(body, 'groom', gc === 'groom' || gc === 'both', reasons.orphan === 'groom')
  if (!groom.ok) return groom
  const bride = validateSide(body, 'bride', gc === 'bride' || gc === 'both', reasons.orphan === 'bride')
  if (!bride.ok) return bride
  if (groom.value.id && groom.value.id === bride.value.id) return { ok: false, error: 'תעודות הזהות של החתן והכלה זהות' }

  let second_matchmaker: SecondMatchmakerInput | null = null
  if (body.single_matchmaker === false) {
    const s = validateSecondMatchmaker(body.second_matchmaker)
    if (!s.ok) return s
    second_matchmaker = s.value
  }
  return { ok: true, value: { match_date, groom: groom.value, bride: bride.value, second_matchmaker, reasons, is_grandchild, grandchild_side: gc } }
}

/** מפתח כפילות לפי שמות (ת"ז אינה חובה בכל בקשה): אותו שידוך לא מוגש פעמיים. */
export function pairKey(c: Pick<ClaimInput, 'groom' | 'bride'>): string {
  return [c.groom.first_name, c.groom.last_name, c.bride.first_name, c.bride.last_name]
    .map(x => x.replace(/\s+/g, ' ').toLowerCase()).join('|')
}

/** ה' בטבת תשפ"ז: ברירת המחדל לפתיחת הגשת בקשות כשהמנהל לא הגדיר אחרת. */
export const DEFAULT_CLAIMS_OPEN = '2026-12-15'

/** המועד המוקדם להגשת בקשה: המאוחר מבין (הרשמה + ימי המתנה) להגדרת הפתיחה הכללית. YYYY-MM-DD. */
export function claimsOpenDate(registeredAt: string | Date, waitDays: number, openFrom: string | null): string {
  const reg = new Date(registeredAt)
  const waited = new Date(Date.UTC(reg.getUTCFullYear(), reg.getUTCMonth(), reg.getUTCDate() + waitDays)).toISOString().slice(0, 10)
  const gate = openFrom ?? DEFAULT_CLAIMS_OPEN
  return waited > gate ? waited : gate
}
