import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { parseCardActivity } from '@/lib/cardActivity'

export const dynamic = 'force-dynamic'

// תנועות (קניות) ויתרה עכשווית של כרטיס המזון בתיק, מנדרים פלוס.
// 🔒 מנהל בלבד — מידע כספי (כמו live-balances).
// ⚠️ בתיק שנפרק היתרה היא 0, ותנועות מוצגות רק אם נדרים עדיין מחזירה אותן.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(['admin']))) return forbidden('התנועות שמורות למנהל')
  const { id } = await params

  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db.from('maternity_aids')
    .select('card_load_status, card_unloaded_at, beneficiary:beneficiaries(nedarim_id)')
    .eq('id', id).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const row = data as { card_load_status?: string | null; card_unloaded_at?: string | null;
    beneficiary?: { nedarim_id?: string | null } | { nedarim_id?: string | null }[] | null }
  const b = Array.isArray(row.beneficiary) ? row.beneficiary[0] : row.beneficiary
  const nedId = (b?.nedarim_id ?? '').toString().trim()
  const unloaded = row.card_load_status === 'unloaded' || (!!row.card_unloaded_at && row.card_load_status !== 'loaded')
  if (!nedId) return NextResponse.json({ available: false, unloaded, balance: unloaded ? 0 : null, purchases: [] })

  let payload: unknown = null
  try { payload = await getClientCardFull(creds, nedId) } catch { payload = null }
  if (!payload) return NextResponse.json({ available: false, unloaded, balance: unloaded ? 0 : null, purchases: [] })

  const act = parseCardActivity(payload)
  return NextResponse.json({
    available: true, unloaded,
    balance: unloaded ? 0 : act.balance,
    purchases: act.purchases,
  })
}
