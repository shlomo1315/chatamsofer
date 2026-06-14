import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  // רק איש צוות פעיל מקבל את הפרופיל שלו; אחרת מחזירים null (אותו מבנה תשובה)
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ profile: null })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ profile: null })

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', staff.userId)
    .maybeSingle()

  return NextResponse.json({ profile })
}
