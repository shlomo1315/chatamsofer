import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME, normalizeEmail } from '@/lib/gilyonot'
import { cleanCity, cleanNote, cleanPhone, cleanQuantity, cleanText } from '@/lib/gilyonotDistributors'
import { distributorMailHtml, loadDistributorSettings } from '@/lib/gilyonotDistributorServer'

// ─────────────────────────────────────────────────────────────────────────────
// מערך המפיצים — טופס הצטרפות ציבורי (/gilyonot/mefitz/join).
// בקשה נשמרת ב-gilyonot_distributor_applications עם reason='web' וממתינה לאישור
// במסך הניהול (לשונית "בקשות הצטרפות"). באישור נוצר מפיץ ונשלח לו מייל.
// ⚠️ טלפון של מפיץ פעיל נחסם עם הודעה כללית, בלי לחשוף את שם המפיץ.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
export const JOIN_PATH = '/gilyonot/mefitz/join'
export const MEFITZ_URL = `${SITE}/gilyonot/mefitz`

export const PHONE_TAKEN_MESSAGE = 'שימו לב: מספר הטלפון הזה כבר רשום במערכת'
export const PENDING_EXISTS_MESSAGE = 'כבר התקבלה בקשה ממספר הטלפון הזה, והיא ממתינה לאישור'

export interface JoinRequest {
  full_name: string
  phone: string
  email: string
  city: string
  synagogue: string | null
  address: string | null
  quantity: number | null
  notes: string | null
}

/** בדיקת הטופס בצד השרת. שדה שהוזן ואינו תקין = שגיאה עם הסבר. */
export function validateJoinRequest(input: Record<string, unknown>): { ok: true; value: JoinRequest } | { ok: false; error: string } {
  const full_name = cleanText(input.full_name, 80)
  if (!full_name || full_name.length < 2) return { ok: false, error: 'נא להזין שם מלא' }
  const phone = cleanPhone(input.phone)
  if (!phone) return { ok: false, error: 'נא להזין מספר טלפון תקין' }
  const email = normalizeEmail(input.email)
  if (!email) return { ok: false, error: 'נא להזין כתובת מייל תקינה' }
  const city = cleanCity(input.city)
  if (!city) return { ok: false, error: 'נא לבחור עיר לחלוקה' }
  const rawQty = String(input.quantity ?? '').trim()
  const quantity = rawQty ? cleanQuantity(rawQty) : null
  if (rawQty && quantity === null) return { ok: false, error: 'הכמות צריכה להיות מספר שלם' }
  return {
    ok: true,
    value: {
      full_name, phone, email, city,
      synagogue: cleanText(input.synagogue, 120),
      address: cleanText(input.address, 160),
      quantity,
      notes: cleanNote(input.notes, 1000),
    },
  }
}

/** הערים שיש בהן מפיצים פעילים, לפי סדר הא"ב. */
export async function joinCities(db: SupabaseClient): Promise<string[]> {
  const set = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('gilyonot_distributors').select('city').eq('status', 'active').not('city', 'is', null).range(from, from + 999)
    for (const r of data ?? []) { const c = cleanCity(r.city); if (c) set.add(c) }
    if (!data || data.length < 1000) break
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'))
}

export type SubmitResult = { ok: true } | { ok: false; code: 'phone_taken' | 'pending_exists' | 'failed'; error: string }

/** שומר בקשה ממתינה. טלפון של מפיץ פעיל, או בקשה ממתינה מאותו טלפון, נחסמים. */
export async function submitJoinRequest(db: SupabaseClient, v: JoinRequest): Promise<SubmitResult> {
  // הטלפון מנורמל לספרות בלבד (cleanPhone), ולכן בטוח בתוך מסנן or
  const { data: taken, error: takenErr } = await db.from('gilyonot_distributors').select('id')
    .eq('status', 'active').or(`phone.eq.${v.phone},phone2.eq.${v.phone}`).limit(1)
  if (takenErr) return { ok: false, code: 'failed', error: 'השליחה נכשלה. נסו שוב.' }
  if (taken?.length) return { ok: false, code: 'phone_taken', error: PHONE_TAKEN_MESSAGE }

  const { data: pending } = await db.from('gilyonot_distributor_applications').select('id')
    .eq('reason', 'web').eq('status', 'pending').eq('phone', v.phone).limit(1)
  if (pending?.length) return { ok: false, code: 'pending_exists', error: PENDING_EXISTS_MESSAGE }

  const { error } = await db.from('gilyonot_distributor_applications').insert({
    full_name: v.full_name, phone: v.phone, email: v.email, city: v.city, synagogue: v.synagogue,
    address: v.address, quantity: v.quantity, notes: v.notes, reason: 'web', status: 'pending',
  })
  // 23505 = הגשה כפולה באותו רגע (האינדקס הייחודי על בקשה ממתינה לכל טלפון)
  if (error) return error.code === '23505'
    ? { ok: false, code: 'pending_exists', error: PENDING_EXISTS_MESSAGE }
    : { ok: false, code: 'failed', error: 'השליחה נכשלה. נסו שוב.' }
  return { ok: true }
}

export interface ApprovedApplication {
  full_name: string | null; phone: string | null; email: string | null; city: string | null
  synagogue: string | null; address: string | null; quantity: number | null
}

/** מייל האישור למפיץ החדש: כל הפרטים שנרשמו, והכניסה לממשק המפיץ. */
export function joinApprovedMail(a: ApprovedApplication, agentPhone: string | null): { subject: string; html: string } {
  const subject = 'אושרה הצטרפותך למערך המפיצים'
  const body = [
    `שלום ${a.full_name ?? ''},`.trim(),
    'שמחים לבשר שבקשתך להצטרף למערך המפיצים של גיליונות החתם סופר אושרה. אלה הפרטים שנרשמו אצלנו:',
  ].join('\n\n')
  const outro = [
    `בממשק המפיצים אפשר לראות את הכמות השבועית, לדווח על קבלה או תקלה ולבקש שינויים. הכניסה בקוד חד-פעמי לטלפון שנרשם:\n${MEFITZ_URL}`,
    agentPhone ? `לשאלות אפשר לפנות בטלפון ${agentPhone}.` : '',
    'תודה שהצטרפת!',
  ].filter(Boolean).join('\n\n')
  const html = distributorMailHtml(subject, body, [
    ['שם', a.full_name], ['טלפון', a.phone], ['מייל', a.email], ['עיר', a.city],
    ['בית כנסת', a.synagogue], ['כתובת', a.address], ['כמות שבועית', a.quantity],
  ], outro)
  return { subject, html }
}

/** שולח את מייל האישור. בלי מייל תקין, מדלג. */
export async function sendJoinApprovedMail(db: SupabaseClient, a: ApprovedApplication): Promise<boolean> {
  const to = normalizeEmail(a.email)
  if (!to) return false
  const s = await loadDistributorSettings(db)
  const { subject, html } = joinApprovedMail(a, s.agent_phone)
  const res = await deliverMail(to, subject, html, undefined, { transactional: true, gmailPriority: 'normal', fromName: GILYONOT_FROM_NAME, fromEmail: GILYONOT_FROM_EMAIL })
  if (!res.ok) console.error('[gilyonot-distributors] join approval mail failed:', res.error)
  return res.ok
}
