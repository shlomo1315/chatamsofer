import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// פרטי החשבון שלקוח הזין לזיכוי אחד, להצגה במסך בלחיצה. מנהל בלבד.
// הצפייה נרשמת ביומן (רק מזהה הזיכוי), והפרטים עצמם לא נכתבים ללוגים.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data, error } = await db.from('book_fair_credits')
    .select('bank_holder, bank_holder_recording, bank_number, bank_branch, bank_account')
    .eq('id', id).eq('status', 'details_entered').maybeSingle()
  if (error) return NextResponse.json({ error: 'הטעינה נכשלה' }, { status: 422 })
  if (!data) return NextResponse.json({ error: 'לא הוזנו פרטי חשבון לזיכוי הזה' }, { status: 404 })

  await logActivity(db, { userId: staff.userId, action: 'book_fair_credits_bank_view', entityType: 'book_fair_credits', entityId: id })
  return NextResponse.json({
    holder: data.bank_holder, holderRecording: data.bank_holder_recording,
    bank: data.bank_number, branch: data.bank_branch, account: data.bank_account,
  }, { headers: NO_STORE })
}
