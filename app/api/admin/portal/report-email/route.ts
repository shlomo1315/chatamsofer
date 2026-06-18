import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminStaff } from '@/lib/apiAuth'
import { getReportEmail, setReportEmail, runWeeklyLoansReport } from '@/lib/loansReport'

export const dynamic = 'force-dynamic'

// requireAdmin מהתשתית המשותפת מאמת גם is_active (הבדיקה הידנית הקודמת פספסה מנהלים מושבתים)
async function requireAdmin() {
  const ctx = await requireAdminStaff()
  return ctx ? { ok: true as const } : { ok: false as const, status: 403, error: 'נדרשות הרשאות מנהל' }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const email = await getReportEmail()
  return NextResponse.json({ email })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { email, send, sendNow } = await req.json()

  // "שלח עכשיו" — שליחה אמיתית + קידום חותמת "נשלח לאחרונה". משתמש בכתובת השמורה,
  // ונופל לכתובת שבשדה אם לא נשמרה (למשל אם טבלת app_settings טרם הוקמה)
  if (sendNow) {
    const to = String(email ?? '').trim()
    const res = await runWeeklyLoansReport({ to: to || undefined, markSent: true })
    if (!res.sent) return NextResponse.json({ error: res.error ?? 'שליחה נכשלה' }, { status: 400 })
    return NextResponse.json({ ok: true, sentTo: res.to, count: res.count ?? 0 })
  }

  // "שלח בדיקה" — שולח לכתובת שהוקלדה (גם אם טרם נשמרה) ואינו מקדם את החותמת
  if (send) {
    const to = String(email ?? '').trim()
    const res = await runWeeklyLoansReport({ to: to || undefined, markSent: false })
    if (!res.sent) return NextResponse.json({ error: res.error ?? 'שליחה נכשלה' }, { status: 400 })
    return NextResponse.json({ ok: true, sentTo: res.to, count: res.count ?? 0 })
  }

  const value = String(email ?? '').trim()
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }
  try {
    await setReportEmail(value)
  } catch (e) {
    // שגיאת DB נפוצה: טבלת app_settings לא קיימת (המיגרציה טרם הורצה)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `שמירה נכשלה: ${msg}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
