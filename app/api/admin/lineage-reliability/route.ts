// ציון אמינות יוחסין לנרשם — קריאה בלבד, ייעוצי. אינו מאשר ואינו משפיע על המשפחה.
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { assessLineageReliability } from '@/lib/lineageReliability'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'view'))) return forbidden()

  const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId')
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400, headers: NO_STORE })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const result = await assessLineageReliability(admin, beneficiaryId)
  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? 'שגיאה' }, { status: 404, headers: NO_STORE })
  }
  return NextResponse.json(result, { headers: NO_STORE })
}
