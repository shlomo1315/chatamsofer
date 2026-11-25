import type { Beneficiary } from '@/types'
import { validatePhone } from '@/lib/validation'

// עריכה מהירה בחלונית הצאצא (BeneficiaryCardModal).
// 🔒 ת״ז של הבעל, של האישה ושל הילדים לא נערכות כאן: הן לא בטיוטה, לא נשלחות
// בשמירה, ובילדים נשמרת הת״ז המקורית. שינוי ת״ז רק בטופס העריכה המלא.
// ⚠️ נשלחים רק השדות שהשתנו, כדי ששמירה מהחלונית לא תדרוס שדות שלא הוצגו בה.

export type Child = NonNullable<Beneficiary['children']>[number]
export interface ChildDraft { name: string; birth_date: string; gender: string }
export interface CardDraft {
  full_name: string; family_name: string; birth_date: string
  phone: string; phone2: string; email: string
  spouse_name: string; spouse_birth_date: string; spouse_phone: string
  marital_status: string; city: string; address: string; notes: string
  children: ChildDraft[]
}
export type CardSource = Pick<Beneficiary,
  'full_name' | 'family_name' | 'birth_date' | 'phone' | 'phone2' | 'email' | 'spouse_name' |
  'spouse_birth_date' | 'spouse_phone' | 'marital_status' | 'city' | 'address' | 'notes'
> & { children?: Child[] | null }

const TEXT_FIELDS = [
  'full_name', 'family_name', 'birth_date', 'phone', 'phone2', 'email', 'spouse_name',
  'spouse_birth_date', 'spouse_phone', 'marital_status', 'city', 'address', 'notes',
] as const
// שדות חובה: נשמרים כמחרוזת ולא כ-null גם כשריקים (הבדיקה חוסמת ריק)
const REQUIRED = new Set<string>(['full_name', 'family_name'])
const DATE_FIELDS = new Set<string>(['birth_date', 'spouse_birth_date'])

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MARRIED = 'נשואים'
export const MARITAL_OPTIONS = ['נשואים', 'גרוש', 'גרושה', 'אלמן', 'אלמנה']

// תאריך בטיוטה בפורמט של input type=date (YYYY-MM-DD)
const isoDay = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

export function draftFrom(src: CardSource): CardDraft {
  return {
    full_name: src.full_name ?? '', family_name: src.family_name ?? '', birth_date: isoDay(src.birth_date),
    phone: src.phone ?? '', phone2: src.phone2 ?? '', email: src.email ?? '',
    spouse_name: src.spouse_name ?? '', spouse_birth_date: isoDay(src.spouse_birth_date), spouse_phone: src.spouse_phone ?? '',
    marital_status: src.marital_status ?? '', city: src.city ?? '', address: src.address ?? '', notes: src.notes ?? '',
    children: (src.children ?? []).map(c => ({ name: c.name ?? '', birth_date: isoDay(c.birth_date), gender: c.gender ?? '' })),
  }
}

export function buildCardPayload(src: CardSource, draft: CardDraft): Record<string, unknown> {
  const orig = draftFrom(src)
  const out: Record<string, unknown> = {}
  for (const k of TEXT_FIELDS) {
    const v = draft[k].trim()
    if (v === orig[k].trim()) continue
    out[k] = REQUIRED.has(k) ? v : v || null
  }
  const kids = src.children ?? []
  const kidsChanged = draft.children.some((c, i) => {
    const o = orig.children[i]
    return !o || c.name.trim() !== o.name.trim() || c.birth_date !== o.birth_date || c.gender !== o.gender
  })
  if (kidsChanged) {
    // כל שאר השדות של הילד (ת״ז, סטטוס לידה, קישור לתיק לידה) נשמרים כמו שהם
    out.children = kids.map((c, i) => {
      const d = draft.children[i]
      return d ? { ...c, name: d.name.trim(), birth_date: d.birth_date || null, gender: d.gender || null } : c
    })
  }
  return out
}

// בודק רק את מה שנשלח, כדי שרשומה ישנה עם שדה חסר לא תחסום שמירה של שדה אחר
export function validateCardPayload(p: Record<string, unknown>, draft: CardDraft): string | null {
  if ('full_name' in p && !p.full_name) return 'שם פרטי הוא שדה חובה'
  if ('family_name' in p && !p.family_name) return 'שם משפחה הוא שדה חובה'
  for (const [k, label] of [['phone', 'טלפון'], ['phone2', 'טלפון נוסף'], ['spouse_phone', 'טלפון האישה']] as const) {
    if (typeof p[k] === 'string' && !validatePhone(p[k] as string)) return `${label} לא תקין`
  }
  if (typeof p.email === 'string' && !EMAIL_REGEX.test(p.email)) return 'כתובת מייל לא תקינה'
  for (const k of DATE_FIELDS) {
    if (typeof p[k] === 'string' && Number.isNaN(Date.parse(p[k] as string))) return 'תאריך לידה לא תקין'
  }
  if ('spouse_name' in p && !p.spouse_name && draft.marital_status === MARRIED) return 'שם האישה הוא שדה חובה'
  if ('children' in p) {
    for (const [i, c] of draft.children.entries()) if (!c.name.trim()) return `חסר שם לילד ${i + 1}`
  }
  return null
}

// מוכנות לאישור — אותן ארבע בדיקות שהיו בחלונית הקודמת
export function readiness(b: Pick<Beneficiary, 'id_number' | 'phone' | 'email_verified_at'>, chainLength: number) {
  const checks = [
    { label: 'ת״ז', missing: 'חסרה ת״ז', ok: !!b.id_number },
    { label: 'סדר הדורות', missing: 'חסר סדר הדורות', ok: chainLength > 0 },
    { label: 'טלפון', missing: 'חסר טלפון', ok: !!b.phone },
    { label: 'מייל מאומת', missing: 'חסר אימות מייל', ok: !!b.email_verified_at },
  ]
  return { checks, done: checks.filter(c => c.ok).length, missing: checks.filter(c => !c.ok).map(c => c.missing) }
}

// כפתור "שליחת קישור לאימות" בחלונית: רק למייל שלא אומת, למי שמורשה לערוך, ולא באמצע עריכה
export function showVerifyButton(b: { email?: string | null; email_verified_at?: string | null }, canEdit: boolean, editing: boolean) {
  return canEdit && !!b.email && !b.email_verified_at && !editing
}

// אותו נתיב של הכרטסת המלאה (EmailRow), שמוגן בשרת ב-beneficiaries/edit
export async function sendVerifyLink(id: string, fetcher: typeof fetch = fetch): Promise<'sent' | 'failed'> {
  try {
    const res = await fetcher(`/api/admin/beneficiaries/${id}/email`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    return res.ok && j.sent !== 0 ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
