import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const url = getAuthUrl()
  return NextResponse.redirect(url)
}
