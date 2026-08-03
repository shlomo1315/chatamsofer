import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getStockBalance, addStockMovement } from '@/lib/cardStock'
import { reconcileStock, heldAidIds } from '@/lib/cardStockRecon'
import { processAwaitingStock } from '@/lib/maternityCards'
import { maybeSendLowStockAlert, resetAlertIfAboveThreshold } from '@/lib/cardStockAlert'
import { isAwaitingCard, AWAITING_SELECT } from '@/lib/awaitingFilter'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET: מלאי נוכחי + יומן התנועות האחרונות (לתצוגה אונליין)
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const balance = await getStockBalance(admin)

  // ── התאמת המלאי ─────────────────────────────────────────────────────────
  // ⚠️ המלאי לבדו אינו בר-בירור: "הכנסתי 300, אישרתי 48, למה 247?". התשובה
  // דורשת את *כל* היומן (לא 50 שורות) ואת מצבם העכשווי של התיקים שנוכה בגינם
  // כרטיס — ולכן היא מחושבת כאן ומוחזרת עם המלאי, ולא נשארת שאלה פתוחה.
  const { data: fullLedger, error: fullErr } = await admin
    .from('card_stock_ledger')
    .select('delta, reason, aid_id')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (fullErr) console.error('[card-stock] recon ledger query failed:', fullErr.message)

  const heldIds = heldAidIds(fullLedger ?? [])
  const { data: heldAids, error: heldErr } = heldIds.length
    ? await admin
        .from('maternity_aids')
        .select('id, status, card_load_status, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
        .in('id', heldIds)
    : { data: [], error: null }
  if (heldErr) console.error('[card-stock] recon aids query failed:', heldErr.message)

  const recon = reconcileStock(fullLedger ?? [], (heldAids ?? []).map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string> | null
    return {
      id: a.id as string,
      status: (a as { status?: string | null }).status ?? null,
      card_load_status: (a as { card_load_status?: string | null }).card_load_status ?? null,
      name: [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || null,
    }
  }))

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
  // ⚠️ אותו סינון בדיוק כמו processAwaitingStock — אחרת המונה מציג מספר
  // אחד והתור מטפל באחר. קודם נספרו רק awaiting_stock, ולכן יולדות
  // בסטטוס approved שהתור כן מטפל בהן לא הופיעו כלל.
  // ⚠️ הסינון מיובא מ-isAwaitingCard ואינו משוכפל כאן: כשהיה עותק מקומי הוא
  // נשאר בלי wants_food_card, ספר יולדת שהתור מדלג עליה, והציג "1 ממתינה"
  // שלא ירדה לעולם מול מלאי מלא.
  const { data: awaitingRows, error: awaitingErr } = await admin
    .from('maternity_aids')
    .select(`id, ${AWAITING_SELECT}, card_load_error, created_at, beneficiary:beneficiaries(family_name, spouse_name, full_name)`)
    .eq('status', 'active')
  if (awaitingErr) console.error('[card-stock] awaiting query failed:', awaitingErr.message)
  const awaitingList = (awaitingRows ?? []).filter(isAwaitingCard)

  // ⚠️ מספר יבש ("1 יולדת ממתינה") אינו ניתן לבירור: אי אפשר לדעת מי ולמה,
  // ואם ההטענה נכשלה — המונה נראה כמו תקלה במקום כמו כשל אמיתי שדורש טיפול.
  // לכן מוחזרים גם השמות וגם סיבת ההמתנה.
  const awaitingDetails = awaitingList.map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string> | null
    const name = [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || 'לא ידוע'
    const failed = a.card_load_status === 'failed'
    return {
      id: a.id as string,
      name,
      failed,
      reason: failed
        ? (a.card_load_error || 'ההטענה נכשלה')
        : (balance > 0 ? 'בתור — תיטען בסבב הקרוב' : 'אין מלאי כרטיסים'),
    }
  })

  return NextResponse.json(
    { balance, ledger: ledger ?? [], awaiting: awaitingList.length, awaitingDetails, recon },
    { headers: NO_STORE },
  )
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

  let body: { delta?: number; note?: string; aidId?: string | null; runQueue?: boolean; returnAid?: string; cards?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ── החזרת כרטיס תלוי למלאי ──────────────────────────────────────────────
  // ⚠️ נרשם כ-'adjust' ולא כ-'restock': אלה אינם כרטיסים חדשים שנכנסו למחסן
  // אלא ניכוי שבוטל. אם היה נרשם כהוספת מלאי, "סך הכרטיסים שהוכנסו" היה תופח
  // בכל תיקון והמנהל היה מאבד את הנתון היחיד שהוא מכיר בוודאות — כמה קנה.
  if (body.returnAid) {
    const aidId = String(body.returnAid)
    const cards = Math.max(1, Math.trunc(Number(body.cards) || 1))
    // ⚠️ אימות מול החישוב ולא אמון בקליינט: בקשה חוזרת (רענון, לחיצה כפולה)
    // הייתה מזרימה כרטיסים שלא היו למלאי.
    const { data: fullLedger } = await admin
      .from('card_stock_ledger')
      .select('delta, reason, aid_id')
      .order('created_at', { ascending: false })
      .limit(5000)
    if (!heldAidIds(fullLedger ?? []).includes(aidId)) {
      return NextResponse.json({ error: 'הכרטיס של תיק זה אינו תלוי — ייתכן שהוחזר כבר' }, { status: 409 })
    }
    try {
      await addStockMovement(admin, {
        delta: cards, reason: 'adjust', aidId,
        note: body.note?.trim() || 'החזרה למלאי — הניכוי אינו מגובה בלידה מאושרת',
        by: staff.userId,
      })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
    }
    // הכרטיס חזר למלאי → מיד לשחרר ממתינות בתור, כמו בכל הוספת מלאי
    const balance = await getStockBalance(admin)
    await resetAlertIfAboveThreshold(admin, balance)
    const res = await processAwaitingStock(admin)
    return NextResponse.json({ balance, processed: res.processed, failed: res.failed, errors: res.errors })
  }

  // הרצת התור בלבד (delta=0) — לטיפול ביולדות שנתקעו ולא נכנסו לתור,
  // בלי להוסיף מלאי. מאפשר "לשחרר" מצב תקוע מהמסך.
  if (body.runQueue) {
    const res = await processAwaitingStock(admin)
    return NextResponse.json({
      balance: await getStockBalance(admin),
      processed: res.processed, failed: res.failed,
      notConfigured: res.notConfigured, errors: res.errors,
    })
  }

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
