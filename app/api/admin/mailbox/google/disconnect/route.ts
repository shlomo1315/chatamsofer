import { NextResponse } from 'next/server'
import { getAuthedAdmin } from '@/lib/admin-auth'
import { disconnectGoogle } from '@/lib/google'

export const dynamic = 'force-dynamic'

// ניתוק חשבון Gmail (מנהל בלבד)
export async function POST() {
  const auth = await getAuthedAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  await disconnectGoogle()
  return NextResponse.json({ ok: true })
}
