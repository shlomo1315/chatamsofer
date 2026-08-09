import { timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { NextResponse } from 'next/server'
import type { SectionKey, Profile } from '@/types'
import { roleAllows, type PermAction } from '@/lib/permissions'

// תשתית אימות אחידה לכל נתיבי ה-API.
// ה-middleware (proxy.ts) אינו מכסה את /api — לכן כל נתיב חייב לאמת בעצמו דרך הקובץ הזה.

export const STAFF_ROLES = ['admin', 'secretary', 'reviewer', 'collections'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export interface StaffContext {
  userId: string
  email: string | null
  role: StaffRole
  permissions: Record<string, string>
  department: string | null
  mailOnly: boolean
  allowedMailboxes: string[]
}

// מפתחות התיבות שמשתמש מורשה אליהן בתיבת המייל.
// null = ללא הגבלה (מנהל, או משתמש ותיק ללא הגדרת תיבות). [] = ללא גישה לתיבות.
export function allowedMailboxKeys(staff: StaffContext): string[] | null {
  if (staff.role === 'admin') return null
  if (staff.allowedMailboxes.length > 0) return staff.allowedMailboxes
  if (staff.department) return [staff.department]
  return staff.mailOnly ? [] : null
}

// לקוח service-role. נכשל סגור: אם המפתח חסר מחזירים null ולא נופלים ל-anon.
//
// ⚡ מופע יחיד למודול: הלקוח חסר-מצב (autoRefreshToken/persistSession כבויים),
// ולכן יצירה מחדש בכל אחת ממאות הקריאות בטעינת מסך הייתה בזבוז נטו.
let _serviceClient: SupabaseClient | null = null
export function getServiceClient(): SupabaseClient | null {
  if (_serviceClient) return _serviceClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _serviceClient
}

// ⚠️ ממוזג ל-cache: נתיב API בודד קורא ל-requirePermission/requireStaff יותר
// מפעם אחת, ודף ניהול יורה עשרות קריאות API במקביל. כל לקוח חדש מנסה לרענן
// את האסימון בעצמו, והרענון של Supabase חד-פעמי — כך שרק הראשון מצליח והשאר
// נכשלים ב-"Refresh Token Not Found". מופע אחד לכל בקשה מבטל את המרוץ.
//
// ⚠️ getUser עטוף ב-try: כשל רענון מחזיר "אין משתמש" (401 מסודר) במקום לזרוק
// שגיאה שמפילה את הבקשה. משתמש שאיבד סשן צריך לראות מסך התחברות, לא מסך
// שגיאה אדום.
const getSessionUser = cache(async () => {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* route handler context */ } },
      },
    }
  )
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch (e) {
    console.error('[apiAuth] getUser נכשל:', e instanceof Error ? e.message : e)
    return null
  }
})

// ⚡ שליפת הפרופיל, ממוזגת לכל בקשה.
//
// ⚠️ למה זה קריטי: טעינת מסך ניהול אחד יורה 8-9 קריאות API במקביל, וכל נתיב
// קורא ל-requireStaff (לעיתים פעמיים, דרך requirePermission) — כלומר עד ~20
// שאילתות profiles זהות לכל טעינת מסך, ולמשתמשי Google אף כפול, כי הנפילה-
// לאחור לפי אימייל נורית בכל אחת מהן מחדש. cache() של React ממזג את כולן
// לשאילתה אחת לכל בקשה.
//
// ⚠️ המיזוג הוא על *שליפת הפרופיל בלבד*, לא על requireStaff עצמו: בדיקת
// allowedRoles שונה בין קוראים, ומיזוג התוצאה הסופית היה מחזיר לקורא אחד את
// הכרעת ההרשאות של קורא אחר.
const getStaffProfile = cache(async (userId: string, email: string | null) => {
  const admin = getServiceClient()
  if (!admin) return null

  // select('*') בכוונה — עמיד גם אם עמודות חדשות (mail_only/allowed_mailboxes) טרם נוספו במסד
  const { data: byId } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (byId) return byId

  // נפילה-לאחור לפי אימייל — תמיכה בכניסה עם Google כאשר זהות ה-auth אינה מקושרת לאותו id
  if (email) {
    const r = await admin.from('profiles').select('*').ilike('email', email).maybeSingle()
    return r.data
  }
  return null
})

// ⚡ הפרופיל עבור מסגרת הניהול (app/admin/layout.tsx) — סרגל הצד וההרשאות.
//
// ⚠️ למה זה כאן ולא שאילתה משלו: ה-layout הריץ getUser() + שאילתת profiles
// נוספות בכל טעינת מסך, זהות לאלה שה-proxy כבר הריץ. שתיהן ממוזגות עכשיו עם
// שאר הקריאות של אותה בקשה, כך שהמסגרת אינה עולה אף סבב רשת נוסף.
//
// אין כאן החלטת הרשאה — ה-proxy כבר חסם מי שאינו איש צוות פעיל לפני שהגענו
// לכאן. הפונקציה רק מספקת את נתוני התצוגה.
export async function getStaffProfileForLayout(): Promise<Profile | null> {
  const user = await getSessionUser()
  if (!user) return null
  const profile = await getStaffProfile(user.id, user.email ?? null)
  return (profile as Profile | null) ?? null
}

// מאמת שהקורא הוא איש צוות פעיל (פרופיל קיים עם תפקיד מוכר). מחזיר null אם לא.
export async function requireStaff(allowedRoles?: StaffRole[]): Promise<StaffContext | null> {
  const user = await getSessionUser()
  if (!user) return null

  const profile = await getStaffProfile(user.id, user.email ?? null)

  if (!profile || profile.is_active === false) return null
  if (!STAFF_ROLES.includes(profile.role as StaffRole)) return null
  if (allowedRoles && !allowedRoles.includes(profile.role as StaffRole)) return null

  return {
    userId: user.id,
    email: profile.email ?? user.email ?? null,
    role: profile.role as StaffRole,
    permissions: (profile.permissions as Record<string, string>) ?? {},
    department: (profile.department as string | null) ?? null,
    mailOnly: profile.mail_only === true,
    allowedMailboxes: (profile.allowed_mailboxes as string[] | null) ?? [],
  }
}

// מאמת שהקורא הוא מנהל (admin) בלבד.
export async function requireAdmin(): Promise<StaffContext | null> {
  return requireStaff(['admin'])
}

// מאמת שלקורא יש הרשאה לפעולה מסוימת במסך מסוים (לפי המטריצה ב-lib/permissions),
// כולל רצפת ההרשאות של התפקיד (למשל מזכירות — עריכת צאצאים תמיד).
// מנהל (admin) עוקף הכל. מחזיר null אם אין הרשאה — נא לענות ב-forbidden().
export async function requirePermission(section: SectionKey, action: PermAction): Promise<StaffContext | null> {
  const staff = await requireStaff()
  if (!staff) return null
  if (staff.role === 'admin') return staff // מנהל — גישה מלאה
  if (!roleAllows(staff.role, staff.permissions, section, action)) return null
  return staff
}

/**
 * איש צוות שאינו מוגבל ל"מייל בלבד".
 *
 * ⚠️ ההגבלה "מייל בלבד" נאכפה עד כה ב-proxy.ts בלבד — כלומר על *המסכים*.
 * ה-middleware אינו מכסה /api כלל, ולכן חשבון מייל-בלבד (או סשן שנגנב ממנו)
 * שנחסם מכל מסך ניהול יכל בכל זאת להוציא PII מלא בקריאת fetch אחת מהקונסול:
 * beneficiary-search, reports, next-pending, nedarim. ההגבלה נראתה אכיפה
 * ולא הייתה אכיפה.
 *
 * מנהל חורג כמו בכל מקום אחר (mail_only אינו חל על admin).
 */
export async function requireNonMailStaff(allowedRoles?: StaffRole[]): Promise<StaffContext | null> {
  const staff = await requireStaff(allowedRoles)
  if (!staff) return null
  if (staff.mailOnly && staff.role !== 'admin') return null
  return staff
}

export function forbidden(message = 'אין הרשאה לבצע פעולה זו') {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function unauthorized(message = 'נדרשת התחברות') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function serverMisconfigured() {
  return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })
}

// אימות סוד קרון: Authorization header בלבד (עם תאימות לאחור ל-?secret= עד עדכון המתזמנים)
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // ⚠️ השוואה בזמן קבוע ולא ===: השוואת מחרוזות רגילה יוצאת בתו הראשון השונה,
  // ומדליפה מידע על הסוד דרך זמן התגובה.
  const eq = (given: string | null | undefined) => {
    if (!given) return false
    const a = Buffer.from(String(given))
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    try { return timingSafeEqual(a, b) } catch { return false }
  }
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ') && eq(auth.slice(7))) return true
  return eq(new URL(request.url).searchParams.get('secret'))
}
