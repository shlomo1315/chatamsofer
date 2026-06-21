import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function getSessionUser() {
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
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// מאמת שהקורא הוא איש צוות פעיל (פרופיל קיים עם תפקיד מוכר). מחזיר null אם לא.
export async function requireStaff(allowedRoles?: StaffRole[]): Promise<StaffContext | null> {
  const user = await getSessionUser()
  if (!user) return null

  const admin = getServiceClient()
  if (!admin) return null

  // select('*') בכוונה — עמיד גם אם עמודות חדשות (mail_only/allowed_mailboxes) טרם נוספו במסד
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

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
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const url = new URL(request.url)
  return url.searchParams.get('secret') === secret
}
