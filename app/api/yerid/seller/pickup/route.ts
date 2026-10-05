import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { SELLER_COOKIE, readSellerToken } from '@/lib/bookFairSeller'
import {
  classifyPickupQuery, maskPhone, pickupState, PICKUP_READY_STATUSES,
} from '@/lib/bookFairStandPickup'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairStatusUpdateEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'

// ─────────────────────────────────────────────────────────────────────────────
// איסוף עצמי בדוכן — חיפוש הזמנה ומסירתה.
//
// 🔴 החשיפה מצומצמת (ההסבר המלא ב-lib/bookFairStandPickup.ts): התאמה מדויקת
// בלבד, הזמנות לאיסוף בלבד, שם + 4 ספרות טלפון. בלי כתובת ובלי מייל.
//
// 🔴 המסירה אטומית: העדכון מותנה ב-picked_up_at IS NULL ובסטטוס ששולם.
// שני מוכרים שלוחצים "נמסר" על אותה הזמנה באותה שנייה — רק אחד מצליח,
// והשני מקבל "כבר נמסר על ידי X".
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SELECT = `
  id, order_number, channel, status, delivery_method, customer_name, customer_phone,
  total_agorot, refunded_agorot, created_at, paid_at, picked_up_at, picked_up_by,
  items:book_fair_order_items(title_snapshot, quantity, line_total_agorot)
`

type Row = {
  id: string; order_number: string; channel: string; status: string; delivery_method: string
  customer_name: string | null; customer_phone: string | null
  total_agorot: number; refunded_agorot: number | null
  created_at: string; paid_at: string | null
  picked_up_at: string | null; picked_up_by: string | null
  items: { title_snapshot: string; quantity: number; line_total_agorot: number }[] | null
}

/** הצורה שהמוכר רואה. ⚠️ אין כאן טלפון מלא, כתובת או מייל — בכוונה. */
function toView(o: Row) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    channel: o.channel,
    state: pickupState(o),
    customerName: o.customer_name,
    phoneHint: maskPhone(o.customer_phone),
    totalAgorot: o.total_agorot,
    refundedAgorot: o.refunded_agorot ?? 0,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    pickedUpAt: o.picked_up_at,
    pickedUpBy: o.picked_up_by,
    items: (o.items ?? []).map(i => ({ title: i.title_snapshot, quantity: i.quantity, lineTotalAgorot: i.line_total_agorot })),
  }
}

export async function GET(request: NextRequest) {
  const seller = readSellerToken(request.cookies.get(SELLER_COOKIE)?.value)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות מחדש' }, { status: 401 })

  // 🔴 מגבלת קצב: החיפוש מחזיר שם לקוח. בלי מגבלה, סיסמת דוכן שדלפה
  // מאפשרת לסרוק טלפונים ברצף ולאסוף שמות.
  if (!rateLimit(`fair-pickup-search:${clientIp(request)}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי חיפושים. המתינו מעט ונסו שוב.' }, { status: 429 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  const parsed = classifyPickupQuery(request.nextUrl.searchParams.get('q') ?? '')
  if (!parsed) {
    return NextResponse.json({ error: 'הזינו מספר הזמנה או מספר טלפון מלא' }, { status: 400 })
  }

  // ⚠️ eq ולא ilike/or: הערך נכנס כפרמטר, לא כמחרוזת מסנן — אין דרך
  // להזריק תנאי .or() דרך שדה החיפוש.
  // ⚠️ מכירות הדוכן עצמו מסומנות 'pickup' ושולמו — אבל נמסרו ברגע המכירה.
  // בלי הסינון הן היו מקבלות כפתור "נמסר" מיותר.
  let query = db.from('book_fair_orders').select(SELECT).neq('channel', 'fair')
  query = parsed.kind === 'phone'
    ? query.eq('customer_phone', parsed.phone).eq('delivery_method', 'pickup')
    : query.eq('order_number', parsed.orderNumber)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
  if (error) {
    console.error('[fair/pickup] search failed:', error.message)
    return NextResponse.json({ error: 'החיפוש נכשל' }, { status: 500 })
  }

  // ⚠️ בחיפוש לפי טלפון מסתירים הזמנות שבוטלו או נוצרו ולא שולמו:
  // הן רק מבלבלות את המוכר מול הלקוח. בחיפוש לפי מספר הזמנה — מציגים
  // הכול, כדי שהמוכר יידע *למה* אין מה למסור.
  const rows = (data ?? []) as unknown as Row[]
  const orders = rows
    .map(toView)
    .filter(o => parsed.kind === 'order' || o.state === 'ready' || o.state === 'delivered')

  return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const seller = readSellerToken(request.cookies.get(SELLER_COOKIE)?.value)
  if (!seller) return NextResponse.json({ error: 'נדרשת התחברות מחדש' }, { status: 401 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const id = String(body.order_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'הזמנה לא תקינה' }, { status: 400 })

  // 🔴 עדכון מותנה = נעילה. כל התנאים בתוך ה-UPDATE עצמו ולא בבדיקה
  // לפניו, כדי ששתי לחיצות מקבילות לא יעברו שתיהן.
  const now = new Date().toISOString()
  const { data: updated, error } = await db.from('book_fair_orders')
    .update({ status: 'delivered', picked_up_at: now, picked_up_by: seller.name })
    .eq('id', id)
    .eq('delivery_method', 'pickup')
    .neq('channel', 'fair')
    .is('picked_up_at', null)
    .in('status', [...PICKUP_READY_STATUSES])
    .select(SELECT)

  if (error) {
    console.error('[fair/pickup] deliver failed:', error.message)
    return NextResponse.json({ error: 'הסימון נכשל — נסו שוב' }, { status: 500 })
  }

  if (!updated?.length) {
    // לא עודכן — מסבירים למה, לפי המצב הנוכחי.
    const { data: cur } = await db.from('book_fair_orders').select(SELECT).eq('id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })
    const view = toView(cur as unknown as Row)
    const msg = view.state === 'delivered' ? 'ההזמנה כבר נמסרה'
      : view.state === 'unpaid' ? 'ההזמנה טרם שולמה — אין למסור'
      : view.state === 'shipping' ? 'הזמנה זו נשלחת בדואר ואינה לאיסוף'
      : 'ההזמנה בוטלה — אין למסור'
    return NextResponse.json({ error: msg, order: view }, { status: 409 })
  }

  const row = updated[0] as unknown as Row
  console.log(`[fair/pickup] הזמנה ${row.order_number} נמסרה בדוכן ע"י ${seller.name}`)

  // מייל "ההזמנה נאספה" ללקוח — אותו מייל שנשלח כשמנהל מסמן נמסר.
  // ⚠️ לא חוסם: המוכר מול הלקוח לא ממתין לשרת מייל.
  void (async () => {
    try {
      const { data: full } = await db.from('book_fair_orders')
        .select('order_number, customer_name, customer_email, tracking_token')
        .eq('id', id).maybeSingle()
      if (!full?.customer_email) return
      await ensureEmailTexts()
      const mail = bookFairStatusUpdateEmail({
        orderNumber: full.order_number as string,
        customerName: full.customer_name as string | null,
        status: 'delivered',
        deliveryMethod: 'pickup',
        trackingToken: full.tracking_token as string | null,
      })
      const sent = await deliverMail(full.customer_email as string, mail.subject, mail.html, undefined,
        { ...mailFor('yerid'), transactional: true })
      if (!sent.ok) console.error(`[fair/pickup] מייל איסוף ל-${full.order_number} נכשל:`, sent.error)
    } catch (e) {
      console.error('[fair/pickup] מייל איסוף נכשל:', (e as Error)?.message ?? e)
    }
  })()

  return NextResponse.json({ ok: true, order: toView(row) })
}
