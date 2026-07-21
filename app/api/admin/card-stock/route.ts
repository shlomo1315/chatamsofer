import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
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
  // ⚠️ שליפה שטוחה + חיבור ידני, ולא join מקונן. ה-join המקונן
  // (aid:maternity_aids(beneficiary:beneficiaries(...))) החזיר aid ריק
  // ועמודת "פרטים" ביומן הופיעה כ-"—" בכל שורה של אישור לידה.
  const { data: rawLedger, error: ledgerErr } = await admin
    .from('card_stock_ledger')
    .select('id, delta, reason, note, created_at, aid_id')
    .order('created_at', { ascending: false })
    .limit(50)
  if (ledgerErr) console.error('[card-stock] ledger query failed:', ledgerErr.message)

  const aidIds = [...new Set((rawLedger ?? []).map(r => r.aid_id).filter(Boolean))] as string[]

  // מיפוי תיק → פרטי היולדת, בשאילתה אחת
  const aidMap = new Map<string, { id: string; beneficiary: Record<string, unknown> | null }>()
  if (aidIds.length) {
    const { data: aids, error: aidsErr } = await admin
      .from('maternity_aids')
      .select('id, beneficiary:beneficiaries(family_name, spouse_name, full_name, id_number, spouse_id_number)')
      .in('id', aidIds)
    if (aidsErr) console.error('[card-stock] aids query failed:', aidsErr.message)
    for (const a of aids ?? []) {
      const benRaw = (a as Record<string, unknown>).beneficiary
      const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, unknown> | null
      aidMap.set(a.id as string, { id: a.id as string, beneficiary: ben ?? null })
    }
  }

  const ledger = (rawLedger ?? []).map(r => ({
    ...r,
    aid: r.aid_id ? aidMap.get(r.aid_id) ?? null : null,
  }))

  // מספר היולדות בתור ההמתנה למלאי — מוצג במסך כדי שיהיה ברור כמה
  // מהכרטיסים שיתווספו יחולקו מיד, וכמה באמת יישארו במלאי.
  // ⚠️ שתי עמודות מסמנות המתנה למלאי, ולא אחת:
  //   card_status         — התור הגלובלי (נקבע ב-loadMaternityCardOnApproval)
  //   card_voucher_status — תור שובר הכרטיס (מוקדים)
  // ספירה לפי אחת בלבד החזירה 0 גם כשיולדת אמיתית המתינה בתור.
  const { data: awaitingRows, error: awaitingErr } = await admin
    .from('maternity_aids')
    .select('id')
    .or('card_status.eq.awaiting_stock,card_voucher_status.eq.awaiting_stock')
  if (awaitingErr) console.error('[card-stock] awaiting query failed:', awaitingErr.message)
  const awaiting = awaitingRows?.length ?? 0

  return NextResponse.json({ balance, ledger: ledger ?? [], awaiting: awaiting ?? 0 }, { headers: NO_STORE })
}

// POST: תנועת מלאי ידנית — { delta, note?, aidId? }.
// delta חיובי = הוספת מלאי (restock), שלילי = הורדה ידנית (manual_out).
export async function POST(request: NextRequest) {
  // ⚠️ תנועות מלאי שמורות למנהל בלבד (לא למזכירות עם הרשאת עריכה):
  // הוספת מלאי מפעילה שיוך אוטומטי ליולדות וטעינת כסף אמיתי בנדרים.
  const staff = await requireAdmin()
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
  let failed = 0
  let notConfigured = false
  let stockErrors: string[] = []
  if (delta > 0) {
    await resetAlertIfAboveThreshold(admin, balance)
    const res = await processAwaitingStock(admin)
    processed = res.processed
    failed = res.failed
    notConfigured = res.notConfigured
    stockErrors = res.errors
    balance = await getStockBalance(admin) // רענון אחרי השיוך
  } else {
    // הורדה ידנית עלולה להוריד אותנו לסף — בדיקת התראה
    await maybeSendLowStockAlert(admin, balance)
  }

  // failed/notConfigured מדווחים למסך — כדי שכשל בשיוך לא ייעלם בשקט
  return NextResponse.json({ balance, processed, failed, notConfigured, errors: stockErrors })
}
