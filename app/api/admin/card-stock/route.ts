import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getStockBalance, addStockMovement } from '@/lib/cardStock'
import { processAwaitingStock } from '@/lib/maternityCards'
import { maybeSendLowStockAlert, resetAlertIfAboveThreshold } from '@/lib/cardStockAlert'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET: מלאי נוכחי + יומן התנועות האחרונות (לתצוגה אונליין)
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const balance = await getStockBalance(admin)
  const { data: ledger } = await admin
    .from('card_stock_ledger')
    .select('id, delta, reason, note, created_at, aid:maternity_aids(id, beneficiary:beneficiaries(family_name, spouse_name, full_name, id_number, spouse_id_number))')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ balance, ledger: ledger ?? [] }, { headers: NO_STORE })
}

// POST: תנועת מלאי ידנית — { delta, note?, aidId? }.
// delta חיובי = הוספת מלאי (restock), שלילי = הורדה ידנית (manual_out).
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity_cards', 'edit')
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { delta?: number; note?: string; aidId?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const delta = Math.trunc(Number(body.delta))
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ error: 'יש להזין כמות שונה מאפס' }, { status: 400 })
  }

  const reason = delta > 0 ? 'restock' : 'manual_out'

  // הורדה ידנית לא יכולה לרדת מתחת לאפס
  if (delta < 0) {
    const cur = await getStockBalance(admin)
    if (cur + delta < 0) {
      return NextResponse.json({ error: `לא ניתן להוריד ${Math.abs(delta)} כרטיסים — במלאי יש רק ${cur}` }, { status: 400 })
    }
  }

  let balance: number
  try {
    balance = await addStockMovement(admin, { delta, reason, aidId: body.aidId ?? null, note: body.note?.trim() || undefined, by: staff.userId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }

  // הוספת מלאי → שיוך אוטומטי (FIFO) לממתינות + איפוס סמן ההתראה אם חזרנו מעל הסף
  let processed = 0
  if (delta > 0) {
    await resetAlertIfAboveThreshold(admin, balance)
    processed = await processAwaitingStock(admin)
    balance = await getStockBalance(admin) // רענון אחרי השיוך
  } else {
    // הורדה ידנית עלולה להוריד אותנו לסף — בדיקת התראה
    await maybeSendLowStockAlert(admin, balance)
  }

  return NextResponse.json({ balance, processed })
}
