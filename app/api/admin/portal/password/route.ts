import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { setPortalPassword } from '@/lib/loansPortalAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // requireAdmin מאמת גם is_active (בדיקת role ידנית פספסה מנהלים מושבתים)
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })

  const { password } = await req.json()
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 })
  }

  await setPortalPassword(String(password))
  return NextResponse.json({ ok: true })
}
