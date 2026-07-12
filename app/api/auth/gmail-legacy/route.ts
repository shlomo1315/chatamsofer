import { NextResponse, type NextRequest } from 'next/server'
import { getLegacyAuthUrl } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// חיבור תיבת Gmail לסנכרון ארכיון.
// חובה לציין לאיזו מחלקה התיבה שייכת — היא נישאת ב-state של OAuth וחוזרת
// ב-callback, כך שכל מייל שנקלט מהתיבה יסומן במחלקה הנכונה.
export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const department = request.nextUrl.searchParams.get('department') ?? ''
  const label = (request.nextUrl.searchParams.get('label') ?? '').slice(0, 60)

  const base = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')

  // ללא מחלקה תקינה — מפנים למסך הבחירה
  if (!department || !(department in DEPARTMENTS)) {
    return NextResponse.redirect(`${base}/admin/settings/connect-mailbox`)
  }

  const url = new URL(getLegacyAuthUrl())
  url.searchParams.set('state', JSON.stringify({ department, label }))
  return NextResponse.redirect(url.toString())
}
