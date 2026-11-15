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

export interface RegisterInput {
  first_name: string; last_name: string; id_number: string; phone: string
  email: string; address: string; city: string; birth_date: string
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
  const birth_date = cleanDate(body.birth_date)
  if (!birth_date) return { ok: false, error: 'תאריך הלידה אינו תקין' }
  const age = (today.getTime() - new Date(birth_date).getTime()) / (365.25 * 86400000)
  if (age < 16 || age > 110) return { ok: false, error: 'תאריך הלידה אינו סביר' }
  return { ok: true, value: { first_name, last_name, id_number, phone, email, address, city, birth_date } }
}

export interface ClaimInput {
  match_date: string
  groom_first_name: string; groom_last_name: string; groom_id: string; groom_father_name: string; groom_phone: string
  bride_first_name: string; bride_last_name: string; bride_id: string; bride_father_name: string; bride_phone: string
  is_grandchild: boolean; grandchild_side: 'groom' | 'bride' | 'both' | null
}

export function validateClaim(body: Record<string, unknown>, today = new Date()): { ok: true; value: ClaimInput } | { ok: false; error: string } {
  const match_date = cleanDate(body.match_date)
  if (!match_date) return { ok: false, error: 'תאריך השידוך אינו תקין' }
  const t = today.getTime()
  if (new Date(match_date).getTime() > t + 366 * 86400000 || new Date(match_date).getTime() < t - 5 * 366 * 86400000) {
    return { ok: false, error: 'תאריך השידוך אינו סביר' }
  }
  const groom_first_name = cleanText(body.groom_first_name, 40)
  const groom_last_name = cleanText(body.groom_last_name, 40)
  const bride_first_name = cleanText(body.bride_first_name, 40)
  const bride_last_name = cleanText(body.bride_last_name, 40)
  if (!groom_first_name || !groom_last_name) return { ok: false, error: 'נא למלא שם פרטי ושם משפחה של החתן' }
  if (!bride_first_name || !bride_last_name) return { ok: false, error: 'נא למלא שם פרטי ושם משפחה של הכלה' }
  const groom_id = normalizeIsraeliId(body.groom_id)
  if (!groom_id) return { ok: false, error: 'תעודת הזהות של החתן אינה תקינה' }
  const bride_id = normalizeIsraeliId(body.bride_id)
  if (!bride_id) return { ok: false, error: 'תעודת הזהות של הכלה אינה תקינה' }
  if (groom_id === bride_id) return { ok: false, error: 'תעודות הזהות של החתן והכלה זהות' }
  const groomPhoneRaw = cleanText(body.groom_phone, 20)
  const bridePhoneRaw = cleanText(body.bride_phone, 20)
  const groom_phone = groomPhoneRaw ? normalizePhone(groomPhoneRaw) : ''
  const bride_phone = bridePhoneRaw ? normalizePhone(bridePhoneRaw) : ''
  if (groom_phone === null) return { ok: false, error: 'טלפון משפחת החתן אינו תקין' }
  if (bride_phone === null) return { ok: false, error: 'טלפון משפחת הכלה אינו תקין' }
  const is_grandchild = body.is_grandchild === true
  const side = String(body.grandchild_side ?? '')
  if (is_grandchild && !['groom', 'bride', 'both'].includes(side)) return { ok: false, error: 'נא לבחור מי נכד החתם סופר: חתן, כלה או שניהם' }
  return {
    ok: true,
    value: {
      match_date, groom_first_name, groom_last_name, groom_id,
      groom_father_name: cleanText(body.groom_father_name, 60), groom_phone,
      bride_first_name, bride_last_name, bride_id,
      bride_father_name: cleanText(body.bride_father_name, 60), bride_phone,
      is_grandchild, grandchild_side: is_grandchild ? (side as 'groom' | 'bride' | 'both') : null,
    },
  }
}
