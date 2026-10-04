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
import { safeEqual } from '@/lib/svix'
import { makeOrderNumber, makeCartToken } from '@/lib/bookFairCheckout'
import { shippingCost, totalVolumes, type TierInput } from '@/lib/bookFairShipping'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { categoryOrder } from '@/lib/bookFairCatalog'
import { BOOK_FAIR_STATUS_LABELS, type BookFairOrderStatus } from '@/types/bookFair'
import {
  nextTurn, initialState, attemptVarName, msgToken, ttsClean, type IvrState, type IvrInput,
} from '@/lib/bookFairYemotIvr'
import { getBookFairMessages } from '@/lib/yemotBookFairMessages'

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

/**
 * חיפוש ספר לפי מק"ט/קוד טלפוני — פעיל וזמין למכירה.
 *
 * 🔴 המלאי משותף לאתר ולטלפון (stock_total). קודם נבדק stock_phone,
 * ומכיוון שכמעט כל המלאי הוקצה לאתר, הטלפון ענה "אזל" על ספרים
 * שהיו במחסן.
 *
 * 🔴 הקלט מגיע מהקשה בטלפון ולכן חייב להיות ספרות בלבד לפני שהוא
 * נכנס ל-.or(): פסיק או נקודה במחרוזת שוברים את הביטוי ומרחיבים
 * את השאילתה לשורות אחרות.
 */
async function findBook(sku: string) {
  const digits = String(sku ?? '').replace(/\D/g, '')
  if (!digits) return null

  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('id, sku, title, price_agorot, stock_total, unlimited_stock, is_active, audio_name')
    .eq('is_active', true)
    .or(`sku.eq.${digits},phone_code.eq.${digits}`)
    .limit(1).maybeSingle()
  if (!data) return null
  const inStock = data.unlimited_stock === true || (data.stock_total ?? 0) > 0
  return { id: data.id, sku: data.sku, title: data.title, price_agorot: data.price_agorot, in_stock: inStock }
}

/** ספר לפי מזהה — לאישור ספר שכבר הוצע. */
async function findBookById(id: string) {
  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('id, sku, title, price_agorot, stock_total, unlimited_stock, audio_name')
    .eq('id', id).eq('is_active', true).maybeSingle()
  if (!data) return null
  return {
    id: data.id, sku: data.sku, title: data.title, price_agorot: data.price_agorot,
    in_stock: data.unlimited_stock === true || (data.stock_total ?? 0) > 0,
  }
}

/**
 * שמות הקטגוריות לפי סדר הקטלוג.
 *
 * ⚠️ הקטגוריה יושבת ב-description (כך הגיעה מהאקסל), והסדר נגזר
 * מקידומת המק"ט — בדיוק כמו בחנות.
 */
async function listCategories(): Promise<string[]> {
  const supa = db()!
  const { rows } = await fetchAllRows<{ sku: string; description: string | null }>((from, to) =>
    supa.from('book_fair_books')
      .select('sku, description')
      .eq('is_active', true).eq('is_hidden', false)
      .order('sku', { ascending: true })
      .range(from, to)
  )
  const seen = new Map<string, number>()
  for (const r of rows) {
    const name = (r.description ?? '').trim()
    if (!name) continue
    const ord = categoryOrder(r.sku)
    if (!seen.has(name) || ord < seen.get(name)!) seen.set(name, ord)
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name)
}

/**
 * הספרים ברשימה — של קטגוריה אחת, או כל הקטלוג כש-category הוא null.
 *
 * ⚠️ ספרים שאזלו *נשארים* ברשימה: המתקשר שומע אותם ומקבל "אזל" רק
 * בניסיון הבחירה. השמטתם הייתה משנה את המספור בין שיחה לשיחה.
 */
async function listBooks(category: string | null) {
  const supa = db()!
  let q = supa.from('book_fair_books')
    .select('id, sku, title, price_agorot, stock_total, unlimited_stock, description, audio_name')
    .eq('is_active', true).eq('is_hidden', false)
  if (category) q = q.eq('description', category)

  const { rows } = await fetchAllRows<{
    id: string; sku: string; title: string; price_agorot: number
    stock_total: number; unlimited_stock: boolean
  }>((from, to) => q.order('sku', { ascending: true }).range(from, to))

  return rows.map(b => ({
    id: b.id, sku: b.sku, title: b.title, price_agorot: b.price_agorot,
    in_stock: b.unlimited_stock === true || (b.stock_total ?? 0) > 0,
  }))
}

/** ההזמנות של המתקשר, לפי מספר הטלפון שממנו התקשר. */
async function listMyOrders(phone: string) {
  const supa = db()!
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return []
  const { data } = await supa.from('book_fair_orders')
    .select('order_number, total_agorot, status')
    .eq('customer_phone', digits)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []).map(o => ({
    order_number: o.order_number as string,
    total_agorot: o.total_agorot as number,
    // ⚠️ ttsClean על התווית: "אי-התאמה" מכיל מקף, שהוא תו מפריד
    // בתחביר הטוקנים של ימות ושובר את ההודעה כולה.
    status: ttsClean(
      BOOK_FAIR_STATUS_LABELS[o.status as BookFairOrderStatus] ?? 'בטיפול',
    ),
  }))
}

/**
 * שמירת פנייה לשירות לקוחות.
 *
 * ⚠️ מחזירה false ולא זורקת: כשל שמירה חייב להישמע למתקשר כ"לא
 * נקלט" ולא כניתוק פתאומי.
 */
async function saveInquiry(
  phone: string, recording: string, transcript: string | undefined, callId: string,
): Promise<boolean> {
  const supa = db()!
  const { error } = await supa.from('book_fair_inquiries').insert({
    phone: String(phone ?? '').replace(/\D/g, '') || 'לא ידוע',
    recording,
    transcript: transcript?.trim() || null,
    call_id: callId || null,
  })
  if (error) {
    console.error('[yemot-book-fair] שמירת הפנייה נכשלה:', error.message)
    return false
  }
  return true
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
  const params: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((v, k) => { params[k] = v })
  if (request.method === 'POST') {
    try {
      const body = await request.formData()
      body.forEach((v, k) => { params[k] = String(v) })
    } catch { /* GET-only request */ }
  }
  return handleBookFairCall(params)
}

/**
 * טיפול בשיחה מתוך פרמטרים גולמיים.
 *
 * 🔴 יריד הספרים הוא שלוחה *נפרדת לחלוטין* — כתובת משל עצמה בימות,
 * שאינה עוברת דרך התפריט הראשי ואינה תלויה בו. זו החלטה מכוונת של
 * המשתמש: המחלקה עומדת בפני עצמה.
 *
 * ⚠️ אל תחברו אותה ל-handle של התפריט הראשי (lib/ivrDelegate). זה
 * נוסה ובוטל במכוון.
 *
 * ⚠️ חתימת פרמטרים ולא NextRequest: מפרידה את פענוח הבקשה מהלוגיקה,
 * וכך אפשר לבדוק את השלוחה בלי לבנות Request מדומה.
 */
export async function handleBookFairCall(params: Record<string, string>): Promise<NextResponse> {
  const supa = db()
  // ⚠️ אין מסד ⇒ אין נוסחים. ברירת המחדל שבקוד היא הדבר היחיד שאפשר
  // להקריא כאן, ולכן הנוסח הזה נשאר מוטמע במכוון.
  if (!supa) return yemotText('id_list_message=t-שגיאת שרת&go_to_folder=hangup')

  const callId = params['ApiCallId'] ?? ''
  const phone = params['ApiPhone'] ?? ''

  // ── אבטחה: אכיפת ApiToken (השוואה בזמן קבוע) ──
  //
  // 🔴 נכשל-סגור. הנתיב הזה משריין מלאי ויוצר הזמנות עם סליקה — כלומר
  // כסף — והוא היה הוובהוק היחיד מבין החמישה שלא אכף דבר. בלי האכיפה
  // כל מי שמכיר את הכתובת היה יכול לרוקן את המלאי בלולאה אחת.
  //
  // ⚠️ הבדיקה *לפני* כל פעולת מסד, כולל ניקוי הניתוק: בקשת ניתוק
  // מזויפת עם callId של שיחה אמיתית הייתה מוחקת את ה-session שלה
  // באמצע השיחה, והמתקשר האמיתי היה מתחיל מאפס.
  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[yemot-book-fair] YEMOT_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return yemotText('id_list_message=t-אין הרשאה&go_to_folder=hangup', callId)
  }
  if (!safeEqual(params['ApiToken'] ?? '', secret)) {
    // ⚠️ אבחון בלי לחשוף את הסוד: רק אורך הערך שהתקבל, האורך הצפוי,
    // ורשימת שמות הפרמטרים. בלי זה אי אפשר להבחין בין "הטוקן חסר",
    // "הטוקן נחתך" ו"הטוקן נכון אבל הסוד בשרת שונה".
    const got = params['ApiToken'] ?? ''
    console.warn(
      `[yemot-book-fair] ApiToken שגוי — דחייה · ` +
      `אורך שהתקבל=${got.length} · אורך צפוי=${secret.length} · ` +
      `קיים=${'ApiToken' in params} · פרמטרים=[${Object.keys(params).join(',')}]`
    )
    return yemotText('id_list_message=t-אין הרשאה&go_to_folder=hangup', callId)
  }

  // ⚠️ ניתוק שיחה — ימות שולחת שוב עם hangup=yes. אין מה להשיב, רק לנקות.
  // ⚠️ המלאי המשוריין משוחרר דרך פקיעת השריון (20 דק') ולא כאן, כדי
  // שניתוק באמצע סליקה לא ישחרר מלאי שההזמנה עליו דווקא כן נסגרה.
  if (params['hangup'] === 'yes') {
    if (callId) await supa.from('book_fair_call_sessions').delete().eq('call_id', callId)
    return yemotText('noop=hangup handled', callId)
  }

  // ── בדיקת הכתובת מצד ימות ──
  //
  // 🔴 ימות פונה לכתובת *בלי ApiCallId* כדי לאמת אותה — גם בהגדרת
  // השלוחה וגם לפני שיחה. השלוחה החזירה כאן "שגיאת שיחה" וניתקה, ולכן
  // כל מי שחייג שמע שגיאה מיד: המערכת מעולם לא הגיעה לברכה.
  //
  // ⚠️ אף שלוחה אחרת אינה דורשת ApiCallId — רק זו דרשה, וזה היה הבאג.
  // התשובה חייבת להיות *תקינה* (לא hangup), אחרת ימות מסמנת את הכתובת
  // כשבורה.
  if (!callId) {
    console.log('[yemot-book-fair] בדיקת כתובת מימות (ללא ApiCallId) — מאשר')
    return yemotText('noop=url check ok')
  }

  // ── הנוסחים ──
  // 🔴 נשלפים כאן, פעם אחת לכל בקשה, ומוזנים ל-nextTurn. מכונת המצבים
  // חייבת להישאר טהורה (בלי גישה למסד) כדי שאפשר יהיה לבדוק בטסטים
  // *מה המתקשר שומע* — הדבר היחיד שאינו מופיע בשום לוג אחרי שניתק.
  //
  // ⚠️ כשל שליפה אינו משתיק את השלוחה: getBookFairMessages מחזירה את
  // ברירות המחדל שבקוד.
  const messages = await getBookFairMessages()

  // ── האם השלוחה פתוחה ──
  //
  // 🔴 שני מפתחות, ו-או ביניהם:
  //   book_fair_open       — היריד כולו (אתר + טלפון)
  //   book_fair_phone_open — הטלפון בלבד
  //
  // ⚠️ הפרדה מכוונת: מפתח אחד לשניהם אילץ לפתוח את האתר הציבורי כדי
  // לבדוק את השיחה בטלפון, כלומר לחשוף קטלוג ולקבל הזמנות אמיתיות
  // לפני שהסליקה הוגדרה. כעת אפשר לבדוק את מסלול השיחה המלא בזמן
  // שהאתר ממשיך להציג "ייפתח בקרוב".
  //
  // ⚠️ זו *אינה* דלת צדדית להזמנות אמיתיות באתר: הנתיב הזה יוצר
  // הזמנות בערוץ 'phone' בלבד, ו-/api/yerid/checkout ממשיך לבדוק
  // את book_fair_open לבדו.
  const [{ data: gate }, { data: phoneGate }] = await Promise.all([
    supa.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
    supa.from('app_settings').select('value').eq('key', 'book_fair_phone_open').maybeSingle(),
  ])
  const isOpen =
    String(gate?.value ?? '') === 'true' ||
    String(phoneGate?.value ?? '') === 'true'

  if (!isOpen) {
    return yemotText(`id_list_message=${msgToken(messages, 'closed')}&go_to_folder=hangup`, callId)
  }

  const session = await loadSession(callId, phone)
  const state = session.state ?? initialState()

  // ── בונים את ה-input המתאים לשלב הנוכחי ──
  const input: IvrInput = {}

  if (state.step === 'main_menu') {
    input.value = paramFor(params, 'bf_main') || paramFor(params, 'bf_main_r')
    // ⚠️ נשלף מראש עבור בחירה 2: nextTurn טהורה ואינה ניגשת למסד,
    // ולכן ההזמנות חייבות להיות בידה לפני שהיא מחליטה מה להקריא.
    if (input.value === '2') input.myOrders = await listMyOrders(phone)
    if (input.value === '1') input.categories = await listCategories()
  } else if (state.step === 'order_menu') {
    // ⚠️ אותו דבר לבחירה 2 (קטגוריות) ו-3 (כל הספרים).
    const v = paramFor(params, 'bf_omenu')
    input.value = v
    if (v === '2') input.categories = await listCategories()
    if (v === '3') input.browseBooks = await listBooks(null)
  } else if (state.step === 'category_menu') {
    input.value = paramFor(params, 'bf_cat')
    input.categories = await listCategories()
  } else if (state.step === 'browse') {
    // ⚠️ שם המשתנה כולל את האינדקס (bf_br<i>) — ראו ההערה ב-browseTurn.
    input.value = paramFor(params, `bf_br${state.browse_index ?? 0}`)
    input.browseBooks = await listBooks(state.browse_category ?? null)
    // ⚠️ הקטגוריות נדרשות גם כאן: הקשה 3 חוזרת לרשימת הקטגוריות,
    // ובלעדיהן היא הייתה מוצאת רשימה ריקה ומנתקת.
    if (state.browse_category) input.categories = await listCategories()
  } else if (state.step === 'confirm_book') {
    input.value = paramFor(params, 'bf_cbook')
    // הספר שהוצע — נשמר במצב, כדי לא לחפש אותו שוב.
    if (state.pending_book_id) input.book = await findBookById(state.pending_book_id)
    if (state.browse_category !== undefined) {
      input.browseBooks = await listBooks(state.browse_category ?? null)
    }
  } else if (state.step === 'record_inquiry') {
    input.recording = paramFor(params, 'bf_inq')
    input.transcript = params['bf_inq_voice'] || undefined
    if (input.recording) {
      input.inquirySaved = await saveInquiry(phone, input.recording, input.transcript, callId)
    }
  } else if (state.step === 'ask_sku') {
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
    // ⚠️ תלוי-כמות — חייב להתאים לשם ב-readTap של nextTurn.
    input.value = paramFor(params, `bf_more${state.items.length}`)
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

  const turn = nextTurn(state, input, messages)

  // ── עדכון המלאי בפועל אחרי תשובת "כמות" מוצלחת ──
  if (state.step === 'ask_qty' && input.reserved) {
    await reserveLastItem(turn.state, session.cart_token)
  }

  // ── שלב תשלום: יוצרים את ההזמנה (pending) ומחזירים credit_card= ──
  if (turn.response === '__CREDIT_CARD_PLACEHOLDER__') {
    const order = await createOrder(turn.state, session.cart_token, phone)
    if (!order) {
      await saveSession(session.id, { ...turn.state, step: 'done' })
      return yemotText(`id_list_message=${msgToken(messages, 'order_error')}&go_to_folder=hangup`, callId)
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
 * ⚠️ פשוטה בכוונה: קריאת stock_total/unlimited_stock בלבד, בלי RPC.
 * מרוץ בין מתקשר בטלפון לקונה באתר על העותק האחרון נסגר ב-reserveLastItem
 * עצמה (ה-RPC אטומי ומחזיר שגיאה אם המלאי כבר אזל) — וזה חשוב במיוחד
 * כעת, כששני הערוצים מנכים מאותה בריכה.
 */
async function reserveLastPreview(
  state: IvrState,
  book: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean },
  qty: number,
): Promise<boolean> {
  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('stock_total, unlimited_stock').eq('id', book.id).maybeSingle()
  if (!data) return false
  if (data.unlimited_stock === true) return true
  return (data.stock_total ?? 0) >= qty
}
