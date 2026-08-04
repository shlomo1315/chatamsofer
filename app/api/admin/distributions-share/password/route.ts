import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { setPortalPassword, hasPortalPassword } from '@/lib/distributionsPortalAuth'

export const dynamic = 'force-dynamic'

// GET — האם כבר הוגדרה סיסמה (לתצוגת הסטטוס במסך ההגדרות)
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
  return NextResponse.json({ hasPassword: await hasPortalPassword() })
}

// POST — קביעת/החלפת סיסמת דף השיתוף. החלפה פוסלת קישורים ישנים אוטומטית.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })

  const { password } = await req.json()
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 })
  }

  await setPortalPassword(String(password))
  return NextResponse.json({ ok: true })
}
