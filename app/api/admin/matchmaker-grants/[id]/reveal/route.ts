import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'
import { logAudit } from '@/lib/matchmaker/adminData'
import { decryptValue } from '@/lib/matchmaker/crypto'

export const dynamic = 'force-dynamic'

// חשיפת ת"ז מלאה של חתן/כלה. כל חשיפה נרשמת ביומן (מי ומתי).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const { id } = await params
  let body: { who?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (body.who !== 'groom' && body.who !== 'bride') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const col = body.who === 'groom' ? 'groom_id_enc' : 'bride_id_enc'
  const { data } = await db.from('matchmaker_claims').select(col).eq('id', id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const value = decryptValue((data as unknown as Record<string, string>)[col])
  await logAudit(db, id, 'reveal_id', body.who === 'groom' ? 'חתן' : 'כלה', staff.email ?? staff.userId)
  return NextResponse.json({ id_number: value }, { headers: { 'Cache-Control': 'no-store' } })
}
