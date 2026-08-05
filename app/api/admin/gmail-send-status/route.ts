import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getSendAccountEmail } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// כתובת חשבון השליחה הייעודי המחובר, או null אם לא חובר.
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  try {
    return NextResponse.json({ email: await getSendAccountEmail() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ email: null })
  }
}
