import { NextResponse } from 'next/server'
import { getLegacyAuthUrl } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  return NextResponse.redirect(getLegacyAuthUrl())
}
