// מעקב אחר אימות כתובות המייל של הנרשמים — מי אימת, מי לא, ומי בכלל לא יכול.
//
// הרקע: אימות המייל ברישום הפך לאופציונלי (מתג בהגדרות), ומאז יש נרשמים עם
// כתובת שלא אומתה. כתובת לא מאומתת פירושה שכל המיילים אליה — אישור בקשה,
// דרישת מסמכים, קוד כניסה — עשויים ליפול לתיבה שאינה שלהם או לא להגיע כלל.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

// אותה בדיקה שבשאר המערכת (lib/verifyChannel) — כדי שמה שנחשב תקין כאן
// ייחשב תקין גם בשליחה עצמה.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ⚠️ מיגרציית 20260805 סימנה למפרע *כל* מוטב עם מייל כ"מאומת", בתאריך ההרשמה
// שלו. לכן ספירת "אומתו לאחרונה" לפי email_verified_at לבדה הייתה מציגה אלפי
// אימותים היסטוריים שמעולם לא קרו, וקצב ההתקדמות היה חסר משמעות.
// מהתאריך הזה ואילך התיעוד אמיתי, ורק הוא נספר כהתקדמות.
export const VERIFY_TRACKING_SINCE = '2026-08-05T00:00:00.000Z'

export function isValidEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').trim()
  return !!e && EMAIL_RE.test(e)
}

/**
 * למה כתובת נחשבת בלתי שמישה. מוצג למנהל כדי שיֵדע מה לתקן — כתובת פגומה
 * לא תאומת לעולם, וגם לא תקבל את הבקשה לאמת.
 */
export function emailProblem(email: string | null | undefined): string | null {
  const raw = email ?? ''
  const e = raw.trim()
  if (!e) return 'אין כתובת'
  if (e !== raw) return 'רווחים מיותרים'
  if (!e.includes('@')) return 'חסר @'
  if ((e.match(/@/g) ?? []).length > 1) return 'יותר מ-@ אחד'
  const [local, domain] = e.split('@')
  if (!local) return 'חסר שם לפני ה-@'
  if (!domain) return 'חסר דומיין'
  if (!domain.includes('.')) return 'דומיין בלי נקודה'
  if (/\s/.test(e)) return 'רווח בתוך הכתובת'
  if (/[א-ת]/.test(e)) return 'אותיות עבריות'
  if (domain.endsWith('.')) return 'דומיין מסתיים בנקודה'
  if (!EMAIL_RE.test(e)) return 'כתובת לא תקינה'
  return null
}

export type UnverifiedRow = {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string | null
  requestedAt: string | null
  problem: string | null
}

export type VerificationStats = {
  total: number
  withEmail: number
  noEmail: number
  verified: number
  unverified: number
  invalid: number
  sendable: number
  requested: number
  neverAsked: number
  verifiedSinceTracking: number
  verifiedLast7Days: number
  percentVerified: number
}

type Row = {
  id: string
  full_name: string | null
  family_name: string | null
  email: string | null
  phone: string | null
  created_at: string | null
  email_verify_requested_at?: string | null
}

const displayName = (r: Row) =>
  [r.family_name, r.full_name].filter(Boolean).join(' ').trim() || 'ללא שם'

/** האם העמודה email_verify_requested_at חסרה (המיגרציה טרם רצה). */
function isMissingColumn(msg: string): boolean {
  return msg.includes('column') && msg.includes('does not exist')
}

/**
 * כל מי שטרם אימת את כתובתו. נשלף במלואו (בדפים) ולא בעמוד אחד — הרשימה
 * היא כלי עבודה, ותקרת 1,000 השורות של PostgREST הייתה חותכת אותה בשקט.
 */
export async function listUnverified(admin: SupabaseClient): Promise<{ rows: UnverifiedRow[]; error: string | null }> {
  const COLS = 'id, full_name, family_name, email, phone, created_at, email_verify_requested_at'
  let res = await fetchAllRows<Row>((from, to) =>
    admin.from('beneficiaries').select(COLS)
      .is('email_verified_at', null).not('email', 'is', null).neq('email', '')
      .order('created_at', { ascending: false }).range(from, to),
  )
  // המיגרציה של עמודת "נשלחה בקשה" טרם רצה — נופלים לרשימה בלי אותו מידע,
  // כדי שהמסך יעבוד ולא ייפול כולו על עמודה חסרה.
  if (res.error && isMissingColumn(res.error)) {
    res = await fetchAllRows<Row>((from, to) =>
      admin.from('beneficiaries').select('id, full_name, family_name, email, phone, created_at')
        .is('email_verified_at', null).not('email', 'is', null).neq('email', '')
        .order('created_at', { ascending: false }).range(from, to),
    )
  }
  if (res.error) return { rows: [], error: res.error }

  const rows = res.rows.map(r => ({
    id: r.id,
    name: displayName(r),
    email: (r.email ?? '').trim(),
    phone: r.phone ?? null,
    createdAt: r.created_at ?? null,
    requestedAt: r.email_verify_requested_at ?? null,
    problem: emailProblem(r.email),
  }))
  return { rows, error: null }
}

const base = (admin: SupabaseClient) =>
  admin.from('beneficiaries').select('id', { count: 'exact', head: true })

/**
 * המספרים המדויקים. נספרים בשרת (count exact) ולא ע"י שליפת כל הטבלה —
 * הספירה היא על אלפי שורות, ואין סיבה להעביר אותן ברשת בשביל מספר.
 *
 * `unverified` נספר מהרשימה עצמה (היא נשלפת ממילא) כדי שהמספר והרשימה לא
 * יוכלו לסתור זה את זה במסך אחד.
 */
export async function verificationStats(
  admin: SupabaseClient, unverified: UnverifiedRow[],
): Promise<VerificationStats> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const [total, withEmail, verified, verifiedSinceTracking, verifiedLast7Days] = await Promise.all([
    base(admin),
    base(admin).not('email', 'is', null).neq('email', ''),
    base(admin).not('email_verified_at', 'is', null),
    base(admin).gte('email_verified_at', VERIFY_TRACKING_SINCE),
    base(admin).gte('email_verified_at', weekAgo),
  ].map(async q => (await q).count ?? 0))

  const invalid = unverified.filter(r => r.problem).length
  const sendable = unverified.length - invalid
  const requested = unverified.filter(r => r.requestedAt).length

  return {
    total,
    withEmail,
    noEmail: Math.max(0, total - withEmail),
    verified,
    unverified: unverified.length,
    invalid,
    sendable,
    requested,
    neverAsked: sendable - unverified.filter(r => r.requestedAt && !r.problem).length,
    verifiedSinceTracking,
    verifiedLast7Days,
    // ⚠️ מתוך מי שיש לו מייל בכלל — אחוז מתוך *כל* הנרשמים היה מעורב עם מי
    // שאין לו כתובת, ואותם אין מה לאמת.
    percentVerified: withEmail ? Math.round((verified / withEmail) * 1000) / 10 : 0,
  }
}
