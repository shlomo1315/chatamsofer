import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { logAudit } from '@/lib/matchmaker/adminData'
import { decryptValue } from '@/lib/matchmaker/crypto'

export const dynamic = 'force-dynamic'

// חשיפת מספר חשבון הבנק המלא של שדכן. כל חשיפה נרשמת ביומן (מי ומתי).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { data } = await db.from('matchmakers').select('bank_account_enc').eq('id', id).maybeSingle()
  if (!data?.bank_account_enc) return NextResponse.json({ error: 'לא נמצאו פרטי חשבון' }, { status: 404 })
  const value = decryptValue(data.bank_account_enc)
  await logAudit(db, null, 'reveal_bank', id, staff.email ?? staff.userId)
  return NextResponse.json({ bank_account: value }, { headers: { 'Cache-Control': 'no-store' } })
}
