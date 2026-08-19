import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getStockBalance, addStockMovement, setBaselineStock } from '@/lib/cardStock'
import { reconcileStock, heldAidIds, approvedCardCoverage, scopedLedger } from '@/lib/cardStockRecon'
import { getPurchases, validatePurchase } from '@/lib/cardPurchases'
import { processAwaitingStock } from '@/lib/maternityCards'
import { maybeSendLowStockAlert, resetAlertIfAboveThreshold } from '@/lib/cardStockAlert'
import { isAwaitingCard, AWAITING_SELECT } from '@/lib/awaitingFilter'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET: מלאי נוכחי + יומן התנועות האחרונות (לתצוגה אונליין)
export async function GET() {
  // ⚠️ requirePermission ולא requireStaff: המסך חושף מלאי, רכישות ושמות
  // משפחה של לידות שמחזיקות כרטיס — נתוני מחלקה לכל דבר.
  if (!(await requirePermission('maternity_cards', 'view'))) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401, headers: NO_STORE })
  }
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: NO_STORE })

  const balance = await getStockBalance(admin)
  const purchases = await getPurchases(admin)

  // ── התאמת המלאי ─────────────────────────────────────────────────────────
  // ⚠️ המלאי לבדו אינו בר-בירור: "הכנסתי 300, אישרתי 48, למה 247?". התשובה
  // דורשת את *כל* היומן (לא 50 שורות) ואת מצבם העכשווי של התיקים שנוכה בגינם
  // כרטיס — ולכן היא מחושבת כאן ומוחזרת עם המלאי, ולא נשארת שאלה פתוחה.
  // ⚠️ fetchAllRows ולא .limit(5000): תקרת השורות של PostgREST נאכפת בשרת
  // ו-.limit() מהלקוח אינו עוקף אותה — הבקשה נחתכת ב-1,000 בלי שגיאה.
  // כאן זה היה מסוכן במיוחד: ההתאמה מחושבת על *כל* היומן, כך שברגע
  // שהיומן יעבור 1,000 תנועות המלאי המוצג היה נעשה שגוי בשקט.
  const { rows: fullLedgerRows, error: fullErr } = await fetchAllRows<{
    id: string; delta: number; reason: string; aid_id: string | null
    created_at: string; note: string | null
  }>((from, to) => admin
    .from('card_stock_ledger')
    .select('id, delta, reason, aid_id, created_at, note')
    .order('created_at', { ascending: false })
    .range(from, to))
  const fullLedger = fullLedgerRows
  if (fullErr) console.error('[card-stock] recon ledger query failed:', fullErr)

  const heldIds = heldAidIds(fullLedger)
  const { data: heldAids, error: heldErr } = heldIds.length
    ? await admin
        .from('maternity_aids')
        .select('id, status, card_load_status, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
        .in('id', heldIds)
    : { data: [], error: null }
  if (heldErr) console.error('[card-stock] recon aids query failed:', heldErr.message)

  const recon = reconcileStock(fullLedger, (heldAids ?? []).map(a => {
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

  // ── לידות מאושרות מול כרטיסים שיצאו ─────────────────────────────────────
  // ⚠️ "יש 48 מאושרות" אינו "יצאו 48 כרטיסים", והפער הזה הוא מקור הבלבול
  // המרכזי: לידה שביקשה בית החלמה בלבד אינה מקבלת כרטיס, ולידה שההטענה שלה
  // נכשלה לא הוציאה כרטיס. לכן מוחזרת השוואה בשמות ולא מספר יחיד.
  // ⚠️ מבוסס על awaitingRows שכבר נשלף (אותו סינון status='active') ולא על
  // שאילתה נוספת — המסך הזה כבר סובל מריבוי שאילתות.
  const cardWanters = (awaitingRows ?? []).filter(a => (a as { wants_food_card?: boolean }).wants_food_card !== false)
  const coverage = approvedCardCoverage(cardWanters.map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string> | null
    return {
      id: a.id as string,
      status: 'active',
      card_load_status: (a as { card_load_status?: string | null }).card_load_status ?? null,
      name: [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || null,
      awaitingStock: isAwaitingCard(a),
    }
  }), heldIds)

  // ── מה קרה מאז הספירה ───────────────────────────────────────────────────
  // ⚠️ "נוכו 1" אינו תשובה — הוא שאלה: איזה כרטיס, של מי, ומתי. כשהטווח מתחיל
  // בספירה יש בו בדרך כלל תנועות בודדות, ולכן הן מוצגות בשמן במקום להשאיר את
  // המנהל לפתוח יומן של חמישים שורות ולנחש איזו מהן נכנסת לחישוב.
  const sinceIds = [...new Set(
    scopedLedger(fullLedger).map(r => (r as { aid_id?: string | null }).aid_id).filter(Boolean),
  )] as string[]
  const sinceNames = new Map<string, string>()
  if (sinceIds.length) {
    const { data: rows } = await admin
      .from('maternity_aids')
      .select('id, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
      .in('id', sinceIds)
    for (const r of rows ?? []) {
      const benRaw = (r as Record<string, unknown>).beneficiary
      const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string> | null
      const nm = [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ')
      if (nm) sinceNames.set(r.id as string, nm)
    }
  }
  const sinceCount = scopedLedger(fullLedger)
    .map(r => {
      const row = r as { id?: string; delta: number; reason: string | null; created_at?: string | null; note?: string | null; aid_id?: string | null }
      return {
        id: String(row.id ?? ''),
        delta: Number(row.delta) || 0,
        reason: row.reason ?? 'adjust',
        created_at: row.created_at ?? null,
        aidId: row.aid_id ?? null,
        name: row.aid_id ? sinceNames.get(row.aid_id) ?? null : null,
        note: row.note ?? null,
      }
    })
    .slice(0, 100)

  // ── כרטיסים טעונים בידי לידות שאינן מאושרות ──────────────────────────────
  // ⚠️ נשלף מ-maternity_aids ולא מהיומן, ובכוונה: אחרי ספירת מלאי היומן מתחיל
  // מנקודת הספירה, וכרטיס שנתקע *לפניה* היה נעלם מהמסך בזמן שהכסף עדיין בידי
  // משפחה שאינה מאושרת. זו תקלה שדורשת פעולה (ביטול הטעינה) ולא נתון להכניס
  // לחשבון — ולכן היא מדווחת בנפרד, תמיד, ללא תלות בטווח ההתאמה.
  const { data: unapprovedLoads } = await admin
    .from('maternity_aids')
    .select('id, status, card_load_amount, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .neq('status', 'active')

  const STATUS_HE: Record<string, string> = {
    pending: 'ממתין לאישור', cancelled: 'לא מאושר', deep_review: 'בדיקה מעמיקה',
  }
  const loadedNotApproved = (unapprovedLoads ?? []).map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string> | null
    return {
      aidId: a.id as string,
      name: [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || 'לא ידוע',
      statusLabel: STATUS_HE[String(a.status ?? '')] ?? '—',
      amount: Number((a as { card_load_amount?: number | null }).card_load_amount ?? 0) || null,
    }
  })

  return NextResponse.json(
    {
      balance, ledger: ledger ?? [], awaiting: awaitingList.length, awaitingDetails,
      recon, coverage, sinceCount, loadedNotApproved,
      // ⚠️ "כרטיסים שנמסרו" = לידות מאושרות שמחזיקות כרטיס. לא "כל מה שאי פעם
      // נטען": כרטיס טעון בידי לידה שאינה מאושרת הוא תקלה לתיקון, וספירתו
      // כ"נמסר" הייתה מקבעת אותה במלאי במקום להציג אותה לטיפול.
      issuedCards: coverage.withCard,

      // 🔴 "סך הכרטיסים שנקנו" — נגזר מהיומן, לא מ-balance+issuedCards.
      //
      // ⚠️ הבאג שהיה: המסך חישב balance + issuedCards. שני המספרים סופרים
      // תחומים שונים — balance הוא *כל* היומן מאז ומעולם, ו-issuedCards
      // סופר רק לידות *פעילות* שמחזיקות כרטיס. כל תיק שנטען ואחר כך הושלם
      // או בוטל נעלם מהצד השני של המשוואה, והמספר יצא קטן מהאמת.
      //
      // המנהל הכניס 300 וראה 295 — הפרש שאינו קיים בשום מקום.
      //
      // ⚠️ הרכישות נספרות מ-restock בלבד: adjust חיובי הוא בדרך כלל החזרה
      // של כרטיס שנוכה ונכשל, והוא אינו קנייה.
      // 🔴 גם adjust חיובי *ללא* aid_id נספר כרכישה.
      //
      // ⚠️ הסינון ל-restock בלבד היה נכון לתנועות חדשות, אבל תנועות
      // ותיקות נשמרו לפני שקיים היה reason מפורש — ושורה בלי reason
      // מנורמלת ל-adjust. כך הכניסה המקורית של 300 לא נספרה כלל,
      // purchasedCards יצא 0, והמסך נפל לנוסחה השבורה balance+issued
      // שהחזירה 295.
      //
      // ⚠️ ההבחנה היא לפי aid_id ולא לפי reason: adjust חיובי *עם*
      // aid_id הוא החזרת כרטיס שנוכה ונכשל — לא קנייה. adjust חיובי
      // בלי שיוך ללידה הוא הוספת מלאי לכל דבר.
      // 🔴 נקרא מטבלת הרכישות ואינו נגזר מהיומן.
      //
      // הגזירה מהיומן נכשלה שלוש פעמים: 0 (הרכישה נדחקה מחוץ ל-50 השורות
      // שנסרקו), 295 (נוסחה שגויה), 662 (סכימת כל התנועות החיוביות —
      // כולל החזרות של כרטיסים שנכשלו ותיקוני ספירה, שאינם רכישות).
      // יומן התנועות אינו יומן רכישות, ואין בו סימן ודאי שמבחין ביניהם.
      purchasedCards: purchases.totalPurchased,
      purchases: purchases.purchases,
    },
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

  let body: { delta?: number; note?: string; aidId?: string | null; runQueue?: boolean; returnAid?: string; cards?: number; setBaseline?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ── ספירת מלאי: קביעת המלאי לפי הספירה הפיזית ────────────────────────────
  if (body.setBaseline != null) {
    const target = Math.trunc(Number(body.setBaseline))
    if (!Number.isFinite(target) || target < 0) {
      return NextResponse.json({ error: 'יש להזין מספר כרטיסים תקין' }, { status: 400 })
    }
    let result: { balance: number; delta: number }
    try {
      result = await setBaselineStock(admin, target, { note: body.note, by: staff.userId })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
    }
    // המלאי גדל → יש כרטיסים לממתינות. קטן → אין מה להריץ.
    let processed = 0
    if (result.delta > 0) {
      await resetAlertIfAboveThreshold(admin, result.balance)
      const res = await processAwaitingStock(admin)
      processed = res.processed
    }
    return NextResponse.json({ balance: result.balance, delta: result.delta, processed })
  }

  // ── החזרת כרטיס תלוי למלאי ──────────────────────────────────────────────
  // ⚠️ נרשם כ-'adjust' ולא כ-'restock': אלה אינם כרטיסים חדשים שנכנסו למחסן
  // אלא ניכוי שבוטל. אם היה נרשם כהוספת מלאי, "סך הכרטיסים שהוכנסו" היה תופח
  // בכל תיקון והמנהל היה מאבד את הנתון היחיד שהוא מכיר בוודאות — כמה קנה.
  if (body.returnAid) {
    const aidId = String(body.returnAid)
    const cards = Math.max(1, Math.trunc(Number(body.cards) || 1))
    // ⚠️ אימות מול החישוב ולא אמון בקליינט: בקשה חוזרת (רענון, לחיצה כפולה)
    // הייתה מזרימה כרטיסים שלא היו למלאי.
    // ⚠️ fetchAllRows ולא .limit(5000) — ראו ההסבר בשליפת ההתאמה למעלה.
    // כאן החיתוך השקט מסוכן במיוחד: זו בדיקת האימות עצמה. יומן שנחתך
    // ב-1,000 היה "מאבד" תיקים ישנים ודוחה החזרה לגיטימית של כרטיס תלוי.
    const { rows: fullLedger } = await fetchAllRows<{
      delta: number; reason: string; aid_id: string | null; created_at: string
    }>((from, to) => admin
      .from('card_stock_ledger')
      .select('delta, reason, aid_id, created_at')
      .order('created_at', { ascending: false })
      .range(from, to))
    if (!heldAidIds(fullLedger).includes(aidId)) {
      return NextResponse.json({ error: 'הכרטיס של תיק זה אינו תלוי — ייתכן שהוחזר כבר' }, { status: 409 })
    }
    // ⚠️ כרטיס שעדיין טעון בנדרים אינו במגירה: הכסף בו וייתכן שהוא בידי
    // המשפחה. החזרתו למלאי הייתה יוצרת כרטיס פנטום — המערכת סופרת כרטיס שאינו
    // קיים ומנפיקה אותו שוב. ביטול הטעינה הוא שמחזיר אותו, והוא עושה זאת לבד.
    const { data: aidRow } = await admin
      .from('maternity_aids').select('card_load_status').eq('id', aidId).maybeSingle()
    if (aidRow?.card_load_status === 'loaded') {
      return NextResponse.json({
        error: 'הכרטיס עדיין טעון בנדרים — יש לבטל את הטעינה בכרטסת הלידה, וההחזרה למלאי תתבצע אוטומטית',
      }, { status: 409 })
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

// ─────────────────────────────────────────────────────────────────────────────
// PUT: רישום רכישת כרטיסים — { quantity, purchasedOn, note? }
//
// ⚠️ נפרד מ-POST (תנועת מלאי) בכוונה, ואינו נוגע ביומן התנועות: רכישה
// עונה על "כמה נקנו בסך הכול", ותנועת מלאי על "כמה יש עכשיו". ערבוב
// השניים הוא בדיוק מה שהחזיר מספרים שגויים שוב ושוב — יומן התנועות
// כולל גם החזרות ותיקוני ספירה, שאינם רכישות.
//
// ⚠️ הוספת רכישה אינה מעלה את המלאי מעצמה. מי שרכש כרטיסים והכניס אותם
// למגירה ירשום גם תנועת מלאי (POST) — שתי פעולות, כי הן באמת שתי
// עובדות נפרדות: לפעמים רוכשים ומקבלים בהמשך.
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  // כמו תנועות המלאי — מנהל בלבד.
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const { quantity, purchasedOn, note } = body as { quantity?: unknown; purchasedOn?: unknown; note?: unknown }

  // ⚠️ התאריך של השרת ולא של הדפדפן: שעון לקוח שגוי היה חוסם רכישה תקינה
  // או מתיר עתידית.
  const today = new Date().toISOString().slice(0, 10)
  const invalid = validatePurchase(quantity, purchasedOn, today)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { error } = await admin.from('card_purchases').insert({
    quantity: Number(quantity),
    purchased_on: purchasedOn as string,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
    created_by: staff.email ?? null,
  })
  if (error) {
    console.error('[card-stock] purchase insert failed:', error.message)
    return NextResponse.json({ error: 'שמירת הרכישה נכשלה' }, { status: 500 })
  }

  const purchases = await getPurchases(admin)
  return NextResponse.json({ ok: true, ...purchases })
}
