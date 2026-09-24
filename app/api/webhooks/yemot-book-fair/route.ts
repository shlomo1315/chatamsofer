// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח — שלוחת המכירה הטלפונית של יריד הספרים.
//
// 🔴 הלוגיקה הטהורה (מה המתקשר שומע בכל שלב) יושבת ב-lib/bookFairYemotIvr.ts.
// הקובץ הזה הוא השכבה שמעליה: טוען/שומר את מצב השיחה, מבצע את חיפושי
// המסד (ספר לפי מק"ט, עיר, תעריף משלוח), משריין מלאי, ובסיום התשלום
// יוצר את ההזמנה בפועל — באותן טבלאות בדיוק שבהן משתמש ערוץ האתר.
//
// ⚠️ פרוטוקול ימות (מודול type=api, ראה זיכרון "yemot-api-module-protocol"):
//   • הודעה:      id_list_message=<טוקנים>
//   • קליטת קלט:  read=<טוקנים>=<שם>,<שימוש-בקיים>,<max>,<min>,<שניות>,...
//   • מעבר:       go_to_folder=<שלוחה> · ניתוק: go_to_folder=hangup
//   • סליקה:      credit_card=<פרמטרים> — ימות עצמה מריצה את כל שיחת
//     הסליקה מול נדרים; פרטי הכרטיס הגולמיים אינם עוברים דרכנו כלל.
//   • פקודות מופרדות ב-"&".
//
// 🔴 מזהה השיחה (ApiCallId) הוא המפתח למצב: כל בקשה מימות עומדת בפני
// עצמה ואינה זוכרת דבר, ולכן book_fair_call_sessions היא הזיכרון היחיד
// בין הקשה להקשה. שורה לכל שיחה, נמחקת/מתיישנת ע"י ה-cron הקיים.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { makeOrderNumber, makeCartToken } from '@/lib/bookFairCheckout'
import { shippingCost, totalVolumes, type TierInput } from '@/lib/bookFairShipping'
import {
  nextTurn, initialState, attemptVarName, type IvrState, type IvrInput,
} from '@/lib/bookFairYemotIvr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * ערך הפרמטר הראשון שקיים מבין כל וריאציות שם המשתנה לבסיס נתון —
 * הבסיס עצמו, ואז _r1/_r2 לכל ניסיון חוזר. ⚠️ בלי זה כל ניסיון שני
 * (bf_sku_r1) היה "נעלם" כי הקוד המשיך לחפש רק את bf_sku.
 */
function paramFor(params: Record<string, string>, base: string): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = params[attemptVarName(base, attempt)]
    if (v) return v
  }
  return ''
}

/**
 * קטגוריית הסליקה בנדרים — מוגדרת גם בהגדרות השלוחה בימות עצמה
 * (credit_card_category_nedarim_plus), חוזרת כאן רק לתיעוד/דיבוג.
 * ⚠️ אינה קובעת דבר בפועל: ההגדרה החיה יושבת בממשק ימות.
 */
const NEDARIM_TERMINAL = '7004562'

function db() {
  return getServiceClient()
}

/** תגובת טקסט לימות. */
function yemotText(body: string, callId?: string) {
  console.log(`[yemot-book-fair] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body.endsWith('&') ? body : `${body}&`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

type CallSession = { id: string; state: IvrState; cart_token: string; order_id: string | null }

async function loadSession(callId: string, phone: string): Promise<CallSession> {
  const supa = db()!
  const { data } = await supa.from('book_fair_call_sessions')
    .select('id, state, cart_token, order_id').eq('call_id', callId).maybeSingle()
  if (data) {
    return {
      id: data.id as string,
      state: data.state as IvrState,
      cart_token: data.cart_token as string,
      order_id: data.order_id as string | null,
    }
  }
  const cartToken = makeCartToken()
  const { data: created } = await supa.from('book_fair_call_sessions')
    .insert({ call_id: callId, phone, state: initialState(), cart_token: cartToken, step: 'welcome' })
    .select('id, state, cart_token, order_id').single()
  return {
    id: created!.id as string,
    state: created!.state as IvrState,
    cart_token: created!.cart_token as string,
    order_id: created!.order_id as string | null,
  }
}

async function saveSession(sessionId: string, state: IvrState, orderId?: string) {
  await db()!.from('book_fair_call_sessions')
    .update({ state, step: state.step, ...(orderId ? { order_id: orderId } : {}) })
    .eq('id', sessionId)
}

/** חיפוש ספר לפי מק"ט/קוד טלפוני — פעיל ובעל מלאי טלפוני. */
async function findBook(sku: string) {
  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('id, sku, title, price_agorot, stock_phone, unlimited_stock, is_active')
    .eq('is_active', true)
    .or(`sku.eq.${sku},phone_code.eq.${sku}`)
    .limit(1).maybeSingle()
  if (!data) return null
  const inStock = data.unlimited_stock === true || (data.stock_phone ?? 0) > 0
  return { id: data.id, sku: data.sku, title: data.title, price_agorot: data.price_agorot, in_stock: inStock }
}

async function findCity(phoneCode: string) {
  const supa = db()!
  const { data } = await supa.from('book_fair_cities')
    .select('id, name').eq('is_active', true).eq('phone_code', Number(phoneCode)).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string } : null
}

async function shippingFor(volumeCount: number): Promise<number | null> {
  const supa = db()!
  const { data: tiers } = await supa.from('book_fair_shipping_tiers')
    .select('min_books, max_books, price_agorot, step_volumes, step_agorot')
  return shippingCost('shipping', volumeCount, (tiers ?? []) as TierInput[])
}

/** שריון מלאי לפריט האחרון שנוסף לעגלה — ⚠️ לא לכל העגלה: הפריטים
 *  הקודמים כבר משוריינים משלב קודם בשיחה. */
async function reserveLastItem(state: IvrState, cartToken: string): Promise<boolean> {
  const last = state.items[state.items.length - 1]
  if (!last) return true
  const supa = db()!
  const { error } = await supa.rpc('book_fair_reserve', {
    p_items: [{ book_id: last.book_id, quantity: last.quantity }],
    p_channel: 'phone',
    p_cart_token: cartToken,
    p_ttl_minutes: 20,
  })
  return !error
}

/** יצירת ההזמנה בפועל — קורה רק אחרי אישור תשלום, ⚠️ לא לפני. */
async function createOrder(state: IvrState, cartToken: string, phone: string): Promise<{ id: string; order_number: string } | null> {
  const supa = db()!
  const itemsTotal = state.items.reduce((s, i) => s + i.price_agorot * i.quantity, 0)
  const shipping = state.shipping_agorot ?? 0

  const orderNumber = makeOrderNumber(new Date().getFullYear())
  const { data: order, error } = await supa.from('book_fair_orders').insert({
    order_number: orderNumber,
    channel: 'phone',
    status: 'pending_payment',
    customer_phone: phone,
    delivery_method: state.delivery ?? 'pickup',
    city_id: state.delivery === 'shipping' ? state.city_id : null,
    // ⚠️ בטלפון הכתובת מגיעה מהקלטה, לא מהקלדה — ממתינה לאימות במשרד.
    address_text: state.delivery === 'shipping' ? (state.address_transcript ?? null) : null,
    address_confirmed: false,
    items_total_agorot: itemsTotal,
    shipping_agorot: shipping,
    total_agorot: itemsTotal + shipping,
  }).select('id, order_number').single()
  if (error || !order) {
    console.error('[yemot-book-fair] order insert failed:', error)
    return null
  }

  await supa.from('book_fair_order_items').insert(
    state.items.map(i => ({
      order_id: order.id, book_id: i.book_id, title_snapshot: i.title, sku_snapshot: i.sku,
      unit_price_agorot: i.price_agorot, quantity: i.quantity,
      line_total_agorot: i.price_agorot * i.quantity,
    }))
  )

  await supa.from('book_fair_reservations')
    .update({ order_id: order.id }).eq('cart_token', cartToken).eq('status', 'held')

  // ⚠️ ההקלטות (כתובת/שם) משויכות להזמנה כאן — עד עכשיו היו שייכות רק
  // ל-call_id, וכרטיס ההזמנה לא היה מוצא אותן בלי השיוך המפורש הזה.
  await supa.from('book_fair_recordings').insert([
    ...(state.address_recording ? [{
      order_id: order.id, kind: 'address', provider_path: state.address_recording,
      transcript: state.address_transcript ?? null, transcript_source: state.address_transcript ? 'yemot' : null,
    }] : []),
    ...(state.name_recording ? [{
      order_id: order.id, kind: 'name', provider_path: state.name_recording,
      transcript: state.name_transcript ?? null, transcript_source: state.name_transcript ? 'yemot' : null,
    }] : []),
  ])

  return { id: order.id, order_number: order.order_number }
}

/** סימון תוצאת התשלום — מצליח: paid + פתיחת book_fair_payments; נכשל: משחרר שריון. */
async function finalizeOrder(orderId: string, cartToken: string, code: string) {
  const supa = db()!
  // ⚠️ '000' = מאושר, לפי LogCreditCard.ini של ימות. כל דבר אחר = נדחה.
  const ok = code === '000' || code.toUpperCase() === 'OK'

  await supa.from('book_fair_payments').insert({
    order_id: orderId,
    provider: `nedarim_yemot:${NEDARIM_TERMINAL}`,
    amount_agorot: 0, // מעודכן למטה מתוך ההזמנה עצמה
    status: ok ? 'success' : 'failed',
    transaction_id: null,
    error_message: ok ? null : `CreditCard_CODE=${code}`,
  })

  if (ok) {
    await supa.from('book_fair_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', orderId)
  } else {
    await supa.from('book_fair_orders').update({ status: 'failed' }).eq('id', orderId)
    await supa.rpc('book_fair_release', { p_cart_token: cartToken })
      .then(undefined, () => { /* best-effort — הפקיעה תתפוס בכל מקרה */ })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const supa = db()
  if (!supa) return yemotText('id_list_message=t-שגיאת שרת&go_to_folder=hangup')

  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((v, k) => { params[k] = v })
  if (request.method === 'POST') {
    try {
      const body = await request.formData()
      body.forEach((v, k) => { params[k] = String(v) })
    } catch { /* GET-only request */ }
  }

  const callId = params['ApiCallId'] ?? ''
  const phone = params['ApiPhone'] ?? ''
  if (!callId) return yemotText('id_list_message=t-שגיאת שיחה&go_to_folder=hangup')

  // ⚠️ ניתוק שיחה — ימות שולחת שוב עם hangup=yes. אין מה להשיב, רק לנקות.
  if (params['hangup'] === 'yes') {
    await supa.from('book_fair_call_sessions').delete().eq('call_id', callId)
    return yemotText('noop=hangup handled', callId)
  }

  // ⚠️ היריד סגור — נבדק לפני כל עיבוד, כמו בבדיקה המקבילה ב-checkout.
  const { data: gate } = await supa.from('app_settings')
    .select('value').eq('key', 'book_fair_open').maybeSingle()
  if (String(gate?.value ?? '') !== 'true') {
    return yemotText(`id_list_message=t-היריד סגור כרגע להזמנות&go_to_folder=hangup`, callId)
  }

  const session = await loadSession(callId, phone)
  const state = session.state ?? initialState()

  // ── בונים את ה-input המתאים לשלב הנוכחי ──
  const input: IvrInput = {}

  if (state.step === 'ask_sku') {
    // ⚠️ בסיס השם תלוי בכמה ספרים כבר בעגלה — ראה ההערה המקבילה
    // ב-lib/bookFairYemotIvr.ts (nextTurn, case 'ask_sku').
    const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
    const raw = paramFor(params, skuBase)
    if (raw) {
      input.value = raw
      input.book = await findBook(raw)
    }
  } else if (state.step === 'ask_qty') {
    const raw = paramFor(params, 'bf_qty')
    if (raw) {
      input.value = raw
      // הספר עצמו כבר ידוע מהשלב הקודם — לא מגיע שוב בפרמטרים.
      const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
      const lastSku = paramFor(params, skuBase)
      input.book = lastSku ? await findBook(lastSku) : null
      if (input.book && Number.isInteger(Number(raw)) && Number(raw) > 0) {
        input.reserved = await reserveLastPreview(state, input.book, Number(raw))
      }
    }
  } else if (state.step === 'ask_more') {
    input.value = paramFor(params, 'bf_more')
  } else if (state.step === 'ask_delivery') {
    input.value = paramFor(params, 'bf_deliv')
  } else if (state.step === 'ask_city') {
    const raw = paramFor(params, 'bf_city')
    if (raw) {
      input.value = raw
      const city = await findCity(raw)
      input.city = city
      if (city) {
        const volumes = totalVolumes(state.items.map(i => ({ volumes: 1, quantity: i.quantity })))
        input.shipping_agorot = await shippingFor(volumes)
      }
    }
  } else if (state.step === 'record_address') {
    input.recording = paramFor(params, 'bf_addr')
    input.transcript = params['bf_addr_voice'] || undefined
  } else if (state.step === 'ask_name') {
    input.recording = paramFor(params, 'bf_name')
    input.transcript = params['bf_name_voice'] || undefined
  } else if (state.step === 'confirm_total') {
    input.value = paramFor(params, 'bf_conf')
  } else if (state.step === 'payment') {
    const code = params['CreditCard_CODE'] ?? ''
    input.payment = (code === '000' || code.toUpperCase() === 'OK') ? 'success' : 'failed'
  }

  const turn = nextTurn(state, input)

  // ── עדכון המלאי בפועל אחרי תשובת "כמות" מוצלחת ──
  if (state.step === 'ask_qty' && input.reserved) {
    await reserveLastItem(turn.state, session.cart_token)
  }

  // ── שלב תשלום: יוצרים את ההזמנה (pending) ומחזירים credit_card= ──
  if (turn.response === '__CREDIT_CARD_PLACEHOLDER__') {
    const order = await createOrder(turn.state, session.cart_token, phone)
    if (!order) {
      await saveSession(session.id, { ...turn.state, step: 'done' })
      return yemotText('id_list_message=t-שגיאה ביצירת ההזמנה אנא פנו למשרד&go_to_folder=hangup', callId)
    }
    await saveSession(session.id, { ...turn.state, order_id: order.id, order_number: order.order_number }, order.id)
    const total = turn.state.items.reduce((s, i) => s + i.price_agorot * i.quantity, 0) + (turn.state.shipping_agorot ?? 0)
    const shekels = (Math.round(total) / 100).toFixed(2)
    // ⚠️ הפרמטרים הקבועים (סוג סליקה, מספר מוסד, קטגוריה, ApiValid)
    // מוגדרים בממשק ניהול השלוחה בימות עצמה — לא כאן. billing_sum הוא
    // הדבר היחיד שמשתנה מהזמנה להזמנה, ולכן הוא היחיד שנשלח דינמית.
    return yemotText(`credit_card=nedarim_plus,${shekels},${NEDARIM_TERMINAL},1,1`, callId)
  }

  // ── תוצאת תשלום — סוגרים את ההזמנה ומנקים את ה-session ──
  if (state.step === 'payment' && input.payment) {
    if (session.order_id) await finalizeOrder(session.order_id, session.cart_token, params['CreditCard_CODE'] ?? '')
    await supa.from('book_fair_call_sessions').delete().eq('call_id', callId)
    return yemotText(turn.response, callId)
  }

  await saveSession(session.id, turn.state)

  if (turn.state.step === 'done') {
    await supa.from('book_fair_call_sessions').delete().eq('call_id', callId)
  }

  return yemotText(turn.response, callId)
}

/**
 * תצוגה מקדימה של שריון — בודקת זמינות בלי לנעול, כדי שהודעת "אזל"
 * תישמע לפני שכותבים ל-reservations. השריון האמיתי (reserveLastItem)
 * קורה רק אחרי שהתשובה כבר מכילה 'reserved: true'.
 *
 * ⚠️ פשוטה בכוונה: קריאת stock_phone/unlimited_stock בלבד, בלי RPC.
 * מרוץ תיאורטי בין שני מתקשרים על העותק האחרון נסגר ב-reserveLastItem
 * עצמה (ה-RPC אטומי ומחזיר שגיאה אם המלאי כבר אזל).
 */
async function reserveLastPreview(
  state: IvrState,
  book: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean },
  qty: number,
): Promise<boolean> {
  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('stock_phone, unlimited_stock').eq('id', book.id).maybeSingle()
  if (!data) return false
  if (data.unlimited_stock === true) return true
  return (data.stock_phone ?? 0) >= qty
}
