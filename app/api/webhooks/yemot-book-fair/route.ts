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
import { downloadFileFromYemot } from '@/lib/yemot'
import { nextOrderNumber, makeCartToken } from '@/lib/bookFairCheckout'
import { shippingCost, totalVolumes, type TierInput } from '@/lib/bookFairShipping'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { categoryOrder } from '@/lib/bookFairCatalog'
import { digitsOnly, matchBookBySku } from '@/lib/bookFairSkuMatch'
import { BOOK_FAIR_STATUS_LABELS, type BookFairOrderStatus } from '@/types/bookFair'
import {
  nextTurn, initialState, attemptVarName, msgToken, ttsClean, type IvrState, type IvrInput,
  addressVarBase, nameVarBase, confirmVarBase,
} from '@/lib/bookFairYemotIvr'
import { getBookFairMessages } from '@/lib/yemotBookFairMessages'
import { transcribeHebrew } from '@/lib/elevenStt'
import { PICKUP_CONFIG_KEY, mergePickupConfig, pickupStatus } from '@/lib/bookFairPickup'

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
 * 🔴 הגדרות הסליקה *כולן* יושבות בממשק ניהול השלוחה בימות — לא כאן.
 * הקוד שולח רק את הסכום (`credit_card=<סכום>`), וכל השאר נקרא משם:
 *
 *   credit_card_type=nedarim_plus
 *   credit_card_terminal_number=7004562
 *   credit_card_category_nedarim_plus=צאצאי מרן החתם סופר
 *   nedarim_plus_ApiValid=<הסוד, בממשק ימות בלבד>
 *   credit_card_max_tashloumim=1 · credit_card_currency=1
 *
 * ⚠️ ניסיון לשלוח את המסוף בפקודה (`nedarim_plus,<סכום>,<מוסד>,1,1`)
 * גרם ל"אין מספר מסוף": ימות קוראת את המסוף רק מההגדרות, והפרמטר
 * השלישי נקרא כשדה אחר.
 *
 * ⚠️ גם הקטגוריה אינה נשלחת מכאן — היא נקבעת ב-
 * credit_card_category_nedarim_plus שבהגדרות השלוחה.
 *
 * הערך כאן הוא לתיעוד ולזיהוי הספק ברישום התשלום בלבד.
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
 *
 * 🔴 ההתאמה מנורמלת (lib/bookFairSkuMatch) ולא `sku.eq`: המק"טים
 * מתחילים באפס ו-14 מהם מכילים מקף שאי אפשר להקיש בטלפון. השוואה
 * ישירה הפילה "201" מול "0201", ואת כל 14 כרכי "חת״ס על הש״ס".
 *
 * ⚠️ הסינון בקוד ולא ב-SQL: אין דרך לנרמל אפס מוביל ומקף בתוך
 * `.or()` בלי להזריק ביטוי. הקטלוג קטן (112 שורות), ולכן שליפת
 * המועמדים וסינון בזיכרון זולה ובטוחה יותר.
 */
async function findBook(sku: string) {
  const digits = digitsOnly(sku)
  if (!digits) return null

  const supa = db()!
  // 🔴 audio_name נשלף ומוחזר: בלעדיו ה-IVR אינו יודע שיש הקלטה לספר
  // ונופל ל-TTS. המנהל העלה הקלטה, ראה "מוקלט" במסך — ובטלפון נשמע
  // קול ממוחשב, בלי שום סימן לתקלה.
  const { rows } = await fetchAllRows<{
    id: string; sku: string; title: string; price_agorot: number
    stock_total: number | null; unlimited_stock: boolean | null
    phone_code: string | null; audio_name: string | null
  }>((from, to) =>
    supa.from('book_fair_books')
      .select('id, sku, title, price_agorot, stock_total, unlimited_stock, phone_code, audio_name')
      .eq('is_active', true)
      .order('sku', { ascending: true })
      .range(from, to)
  )

  // קוד טלפוני ייעודי גובר על המק"ט — הוא נקבע ידנית בדיוק לשם כך.
  const data = rows.find(r => r.phone_code && digitsOnly(r.phone_code) === digits)
    ?? matchBookBySku(digits, rows)
  if (!data) return null

  const inStock = data.unlimited_stock === true || (data.stock_total ?? 0) > 0
  return {
    id: data.id, sku: data.sku, title: data.title,
    price_agorot: data.price_agorot, in_stock: inStock,
    audio_name: data.audio_name,
  }
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
    // ⚠️ כמו ב-findBook — בלי זה אישור הספר מוקרא ב-TTS גם כשיש הקלטה.
    audio_name: data.audio_name,
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

  // 🔴 השאילתה נבנית מחדש בכל עמוד ואינה משותפת.
  //
  // ⚠️ זה מה שהחזיר "אין ספרים בקטגוריה זו": builder של Supabase הוא
  // thenable חד-פעמי — אחרי שהוא בוצע, קריאה חוזרת עליו מחזירה ריק.
  // fetchAllRows קורא לפונקציה פעם לכל עמוד, ולכן q משותף נצרך בעמוד
  // הראשון והשאר חזרו ריקים. הלוג הראה cats=9 ו-books=0 בעוד המסד
  // החזיק 4 שורות תואמות.
  const { rows } = await fetchAllRows<{
    id: string; sku: string; title: string; price_agorot: number
    stock_total: number; unlimited_stock: boolean
    audio_name: string | null; description: string | null
  }>((from, to) => {
    const q = supa.from('book_fair_books')
      .select('id, sku, title, price_agorot, stock_total, unlimited_stock, description, audio_name')
      .eq('is_active', true).eq('is_hidden', false)
    // ⚠️ הסינון *אינו* ב-SQL: listCategories מחזירה את השם אחרי trim,
    // ו-.eq('description', ...) משווה לערך הגולמי שבעמודה. רווח נסתר
    // בקצה — או כל הפרש אחר — מחזיר אפס שורות בלי שום שגיאה, וזה
    // בדיוק מה שהמתקשר שמע כ"אין ספרים בקטגוריה זו".
    //
    // הקטלוג קטן (112 שורות), ולכן סינון בזיכרון זול ובטוח יותר.
    return q.order('sku', { ascending: true }).range(from, to)
  })

  const want = (category ?? '').trim()
  return rows
    .filter(b => !want || (b.description ?? '').trim() === want)
    .map(b => ({
    id: b.id, sku: b.sku, title: b.title, price_agorot: b.price_agorot,
    in_stock: b.unlimited_stock === true || (b.stock_total ?? 0) > 0,
    // ⚠️ audio_name נשלף כבר ב-select אך לא הוחזר — ולכן גם בדפדוף
    // הספרים נשמע TTS במקום ההקלטה.
    audio_name: b.audio_name,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 רק הזמנות ששולמו מוקראות בטלפון.
//
// הקראת `cancelled` הפכה את השלוחה למטעה פעמיים בשיחה אחת: תחילה
// "לא נמצאו הזמנות" (כי הטלפון לא תאם), ומיד אחריה הקראת הזמנה
// שבוטלה — מתקשר ששמע "הזמנה מספר X בוטל" הבין שההזמנה *שלו* בוטלה.
//
// ⚠️ 21 מתוך 29 ההזמנות במסד הן cancelled (עגלות נטושות וניסיונות
// תשלום שלא הושלמו). אלו אינן הזמנות מבחינת הלקוח — הן רעש פנימי.
//
// ⚠️ pending_payment *אינה* מוקראת: הלקוח נטש לפני התשלום ואין לו
// מה לעקוב אחריו; הקראתה הייתה מרמזת שההזמנה קיימת.
// ─────────────────────────────────────────────────────────────────────────────
const SPOKEN_STATUSES = [
  'paid', 'picking', 'packed', 'shipped', 'delivered',
  'refunded', 'partially_refunded',
] as const

/** ההזמנות של המתקשר, לפי מספר הטלפון שממנו התקשר. */
async function listMyOrders(phone: string) {
  const supa = db()!
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return []

  // 🔴 ימות מעבירה את המספר בכמה צורות: "0533157835", "533157835"
  // (בלי האפס המוביל) ולעיתים עם קידומת "972". השוואה לצורה אחת
  // בלבד החזירה "לא נמצאו הזמנות" ללקוח שהזמין באמת.
  const local = digits.replace(/^972/, '')
  const variants = Array.from(new Set([
    digits,
    local,
    local.startsWith('0') ? local.slice(1) : `0${local}`,
  ].filter(Boolean)))

  const { data } = await supa.from('book_fair_orders')
    .select('order_number, total_agorot, status')
    .in('customer_phone', variants)
    .in('status', SPOKEN_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []).map(o => ({
    order_number: o.order_number as string,
    total_agorot: o.total_agorot as number,
    statusCode: o.status as string,
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

/**
 * ערי המשלוח הפעילות, לפי קוד — להקראה בתפריט העיר.
 *
 * 🔴 בלי זה נשמע "הקישו את קוד העיר" והמתקשר אינו יודע מהו הקוד של
 * ירושלים. הרשימה נבנית מהמסד, בדיוק כמו תפריט הקטגוריות.
 */
async function listCities() {
  const supa = db()!
  const { data } = await supa.from('book_fair_cities')
    .select('phone_code, name')
    .eq('is_active', true)
    .order('phone_code', { ascending: true })
  return (data ?? []).map(c => ({
    phone_code: Number(c.phone_code),
    name: String(c.name),
  }))
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

/**
 * מעתיק הקלטה מימות לאחסון שלנו ומחזיר את הנתיב, או null בכישלון.
 *
 * 🔴 ימות מוחקת הקלטות ישנות, והקלטת הכתובת היא לעיתים המקור היחיד
 * לכתובת המשלוח. עד כה storage_path נשאר ריק וההקלטה הייתה תלויה
 * לגמרי בימות.
 *
 * ⚠️ best-effort בלבד: כישלון אינו מפיל את יצירת ההזמנה — ההקלטה
 * עדיין נגישה דרך ימות, והנתיב פשוט יישאר ריק.
 *
 * ⚠️ שני חשבונות ושני שורשים: היריד עבר לחשבון משלו ב-04.10, והקלטות
 * שקדמו לכך יושבות בחשבון הכללי.
 */
async function archiveRecording(
  orderId: string, kind: string, providerPath: string,
): Promise<string | null> {
  try {
    const supa = db()
    if (!supa || !providerPath) return null

    const extDir = process.env.YEMOT_BOOK_FAIR_EXT || '9'
    const names = /\.(wav|mp3)$/i.test(providerPath)
      ? [providerPath]
      : [`${providerPath}.wav`]

    let data: ArrayBuffer | null = null
    for (const n of names) {
      for (const p of [`ivr2:/${n}`, `ivr2:/${extDir}/${n}`]) {
        for (const scope of ['bookFair', 'default'] as const) {
          const f = await downloadFileFromYemot(p, scope)
          if (f.ok && f.data) { data = f.data; break }
        }
        if (data) break
      }
      if (data) break
    }
    if (!data) return null

    // ⚠️ דלי documents ולא דלי חדש: הוא כבר קיים ו*פרטי*, וההקלטה
    // מכילה שם וכתובת מלאה. דלי ציבורי היה חושף אותן לכל מי שמנחש
    // את הנתיב.
    const key = `book-fair/${orderId}/${kind}.wav`
    const { error } = await supa.storage.from('documents')
      .upload(key, data, { contentType: 'audio/wav', upsert: true })
    if (error) {
      console.warn('[fair/archive] העלאה נכשלה:', error.message)
      return null
    }
    return key
  } catch (e) {
    console.warn('[fair/archive] נכשל:', e)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 גיבוי ההקלטה ברגע שהיא נקלטת — לפני שימות דורסת אותה.
//
// כל ההקלטות בשלוחה חולקות נתיב קבוע ("30/9.wav" לכתובת, "15/9.wav"
// לשם): ימות שומרת לפי *מיקום בתסריט*, לא לפי שיחה. המתקשר הבא דורס
// את ההקלטה של הקודם תוך שניות.
//
// ⚠️ הגיבוי הקודם רץ ביצירת ההזמנה — אחרי בחירת משלוח, הקראת סכום
// ותשלום מלא בכרטיס. עד אז הקובץ כבר לא היה שלו. זו הסיבה שכל
// storage_path במסד ריק, ושההקלטות של הזמנות ששולמו אבדו.
//
// ⚠️ הקובץ נשמר לפי call_id, שהוא ייחודי לשיחה, ולא לפי order_id —
// ההזמנה עדיין לא קיימת בשלב הזה. createOrder מחברת אותם אחר כך.
//
// ⚠️ best-effort מוחלט: כישלון כאן לעולם אינו מפיל את השיחה. מתקשר
// שמאבד את הקו באמצע הזמנה גרוע מהקלטה חסרה.
// ─────────────────────────────────────────────────────────────────────────────
async function stashRecording(
  callId: string,
  kind: 'address' | 'name',
  providerPath: string | undefined,
  transcript: string | undefined,
  callYfId?: string,
  callDid?: string,
  callPhone?: string,
  callTime?: string,
): Promise<string | undefined> {
  if (!providerPath) return
  // 🔴 "Digits-0" / "Digits-*" אינו נתיב קובץ אלא *ההקשות* של
  // המתקשר — כך ימות עונה כשסוג ה-read הוא 'voice'. ערך כזה נשמר
  // כ-provider_path, כל הורדה נכשלה, ובמסך נראה "ההקלטה לא נמצאה".
  if (/^Digits[-=]/i.test(providerPath)) {
    console.warn(`[fair/stash] ערך שאינו נתיב הקלטה: "${providerPath}" — נשמר תמלול בלבד`)
  }
  try {
    const supa = db()
    if (!supa) return

    const extDir = process.env.YEMOT_BOOK_FAIR_EXT || '9'
    const name = /\.(wav|mp3)$/i.test(providerPath) ? providerPath : `${providerPath}.wav`

    // ─────────────────────────────────────────────────────────────────────
    // 🔴 ההקלטות יושבות ב-ivr2:/ApiVoice, ושם הקובץ נבנה מהמטא-דאטה
    // של השיחה — לא מהערך שחוזר ב-bf_addr:
    //
    //   DID-<מספר המערכת>-Phone-<טלפון המתקשר>-Folder-<שלוחה>-in.wav-<ApiTime>
    //   DID-093130924-Phone-0533161917-Folder-9-in.wav-1791146153
    //
    // ⚠️ "30/9.wav" אינו נתיב כלל: 30 הוא מספר השניות ו-9 השלוחה.
    // כל הניסיונות להתייחס אליו כאל תיקייה/קובץ נכשלו, וזה מה שגרם
    // ל"ההקלטה לא נמצאה בימות" בכל הזמנה.
    //
    // ⚠️ ApiTime הוא חותמת השיחה ולא של ההקלטה, ולכן הוא זהה לשתי
    // ההקלטות באותה שיחה (שם וכתובת) — ההפרדה היא לפי in.wav מול
    // הסיומות האחרות, וננסה כמה וריאציות.
    // ─────────────────────────────────────────────────────────────────────
    const did = (callDid ?? '').replace(/\D/g, '')
    const ph = (callPhone ?? '').replace(/\D/g, '')
    const at = (callTime ?? '').replace(/\D/g, '')
    const yf = (callYfId ?? '').trim()

    // ─────────────────────────────────────────────────────────────────────
    // 🔴 המבנה האמיתי, כפי שאומת בסריקת עץ ימות (yemot-tree):
    //
    //   Trash/ApiVoice  — "1791146389-DID-093130924-Phone-0548495636-Folder-9-in.wav"
    //   Trash/ApiRecord — "Phone-0583273227-id---1791144139.wav"
    //
    // ⚠️ החותמת בתחילת השם ב-ApiVoice, לא בסופו. בניתי אותו הפוך לפי
    // הסדר שראיתי בצילום הממשק — שם ימות מציגה את השם הפוך — ולכן
    // כל הורדה נכשלה גם כשהתיקייה הייתה נכונה.
    //
    // ⚠️ שתי התיקיות תחת Trash: ימות מעבירה הקלטות API לסל המיחזור
    // מיד, וזו הסיבה שאחד-עשר נתיבים אחרים החזירו "לא נמצא".
    //
    // ⚠️ ApiTime הוא חותמת תחילת השיחה, בעוד שם הקובץ נושא את חותמת
    // *סיום ההקלטה* — הפרש של עשרות שניות. לכן נבדק טווח ולא ערך
    // יחיד, והחיפוש הוא ברשימת התיקייה ולא בשם מנוחש.
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 התיקייה *נרשמת* ומחפשים בה — לא מנחשים שמות.
    //
    // ⚠️ ניחוש היה דורש מאות ניסיונות הורדה לכל הקלטה (החותמת היא
    // של סיום ההקלטה ואינה ידועה מראש), ומאט שיחה חיה. קריאה אחת
    // ל-GetIVR2Dir מחזירה את כל השמות, והבחירה נעשית מהם.
    const token = process.env.YEMOT_BOOK_FAIR_TOKEN?.trim() || process.env.YEMOT_TOKEN?.trim()
    const candidates: string[] = []

    if (token && ph) {
      const phoneTail = ph.replace(/^0/, '')
      for (const folder of ['ivr2:/Trash/ApiVoice', 'ivr2:/Trash/ApiRecord']) {
        try {
          const r = await fetch(
            `https://www.call2all.co.il/ym/api/GetIVR2Dir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(folder)}`,
            { cache: 'no-store' },
          )
          const j = await r.json().catch(() => null) as { files?: { name?: string }[] } | null
          // ⚠️ ההתאמה לפי הטלפון בשם, והחדש ביותר ראשון: שתי ההקלטות
          // של אותה שיחה (שם וכתובת) נבדלות רק בחותמת.
          const mine = (j?.files ?? [])
            .map(f => String(f.name ?? ''))
            .filter(n => n.includes(phoneTail) || n.includes(ph))
            .sort()
            .reverse()
          for (const n of mine.slice(0, 4)) candidates.push(`${folder}/${n}`)
        } catch { /* תיקייה שאינה נגישה — ממשיכים */ }
      }
    }

    // נפילה אחורה לנתיבים הישנים.
    if (yf) candidates.push(`ivr2:/Trash/ApiRecord/${yf}.wav`)
    candidates.push(`ivr2:/${name}`, `ivr2:/${extDir}/${name}`)

    let data: ArrayBuffer | null = null
    let found = ''
    for (const p of candidates) {
      for (const scope of ['bookFair', 'default'] as const) {
        const f = await downloadFileFromYemot(p, scope)
        if (f.ok && f.data) { data = f.data; found = `${scope}:${p}`; break }
      }
      if (data) break
    }
    // ⚠️ הנתיב שהצליח נרשם: בלעדיו אי אפשר לדעת איזו תיקייה נכונה,
    // וכל תקלה עתידית מתחילה מאפס.
    if (found) console.log(`[fair/stash] נמצא ב-${found}`)

    // 🔴 רשת ביטחון אחרונה: הורדה ישירה דרך ה-API של ההקלטות.
    //
    // ⚠️ ימות מציעה נתיב ייעודי לקבצי שיחה (ApiCallId + שם הקובץ)
    // שאינו עובר דרך מערכת הקבצים של השלוחות. אם כל הנתיבים נכשלו,
    // זהו הניסיון שעשוי בכל זאת להחזיר את ההקלטה.
    if (!data) {
      const token = process.env.YEMOT_BOOK_FAIR_TOKEN?.trim() || process.env.YEMOT_TOKEN?.trim()
      if (token) {
        for (const url of [
          `https://www.call2all.co.il/ym/api/DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(`ivr2:${providerPath}`)}`,
          `https://www.call2all.co.il/ym/api/GetFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(providerPath)}`,
        ]) {
          try {
            const res = await fetch(url, { cache: 'no-store' })
            const ct = res.headers.get('content-type') ?? ''
            if (res.ok && !ct.includes('application/json')) {
              const buf = await res.arrayBuffer()
              if (buf.byteLength > 1000) {
                data = buf
                console.log(`[fair/stash] נמצא בניסיון הישיר (${buf.byteLength} בתים)`)
                break
              }
            }
          } catch { /* ממשיכים למועמד הבא */ }
        }
      }
    }

    // ⚠️ גם כשההורדה נכשלת — התמלול והנתיב נשמרים. כתובת משוערת
    // עדיפה על שום כתובת, וזו בדיוק הנקודה שבה המידע אבד עד היום.
    // 🎙️ תמלול ElevenLabs על אותו קובץ שכבר הורד — מוקרא למתקשר לאישור.
    // ⚠️ תקרת זמן קשיחה: זו שיחה חיה. בלי תמלול השיחה ממשיכה כרגיל.
    let heard: string | undefined
    if (data) {
      const t0 = Date.now()
      heard = (await transcribeHebrew(data, { timeoutMs: 6000 })) ?? undefined
      console.log(`[fair/stt] ${kind} ${Date.now() - t0}ms ${heard ? 'תומלל' : 'ללא תמלול'} call=${callId}`)
    }

    const key = data ? `book-fair/calls/${callId}/${kind}.wav` : null
    if (data && key) {
      const up = await supa.storage.from('documents')
        .upload(key, data, { contentType: 'audio/wav', upsert: true })
      if (up.error) console.warn('[fair/stash] העלאה נכשלה:', up.error.message)
    } else {
      console.warn(`[fair/stash] ההורדה מימות נכשלה — נשמר תמלול בלבד. call=${callId} path=${providerPath}`)
    }

    await supa.from('book_fair_call_recordings').upsert({
      call_id: callId,
      kind,
      provider_path: providerPath,
      storage_path: data ? key : null,
      transcript: heard ?? transcript ?? null,
    }, { onConflict: 'call_id,kind' })
    return heard
  } catch (e) {
    console.warn('[fair/stash] נכשל:', e)
    return undefined
  }
}

/** האם האיסוף העצמי פתוח כרגע — לפי אותה הגדרה שהאתר קורא. */
async function pickupAvailable(): Promise<boolean> {
  try {
    const supa = db()
    if (!supa) return true
    const { data } = await supa.from('app_settings').select('value').eq('key', PICKUP_CONFIG_KEY).maybeSingle()
    let raw: unknown = null
    try { raw = data?.value ? JSON.parse(String(data.value)) : null } catch { raw = null }
    return pickupStatus(mergePickupConfig(raw), new Date()).available
  } catch {
    // ⚠️ תקלה בקריאה אינה סוגרת את האיסוף בשקט — כמו באתר.
    return true
  }
}

/** יצירת ההזמנה בפועל — קורה רק אחרי אישור תשלום, ⚠️ לא לפני. */
async function createOrder(state: IvrState, cartToken: string, phone: string, callId: string): Promise<{ id: string; order_number: string } | null> {
  const supa = db()!
  const itemsTotal = state.items.reduce((s, i) => s + i.price_agorot * i.quantity, 0)
  const shipping = state.shipping_agorot ?? 0

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 מספר ההזמנה *אינו* מוקצה כאן — רק אחרי תשלום בפועל.
  //
  // השורה חייבת להיווצר לפני הסליקה (נדרים מחזירה callback שצריך
  // למה להיתלות), אבל המספר הוא משאב שהלקוח שומע ומוסר בטלפון.
  // הקצאתו לפני התשלום שרפה מספרים על כל מתקשר שנטש: 121201 ו-121202
  // נוצרו כך תוך שעה, ושתיהן "ממתין לתשלום" לנצח.
  //
  // ⚠️ מספר זמני ייחודי ומסומן: order_number הוא NOT NULL ו-UNIQUE,
  // ולכן אי אפשר להשאירו ריק. התחילית TMP- מסמנת לכל מסך שזו עדיין
  // אינה הזמנה אמיתית, ו-finalizeOrder מחליפה אותה במספר הרץ.
  // ─────────────────────────────────────────────────────────────────────────
  const tempNumber = `TMP-${cartToken.slice(0, 12)}`
  const { data: order, error } = await supa.from('book_fair_orders').insert({
    order_number: tempNumber,
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
  //
  // 🔴 וגם מועתקות לאחסון שלנו: ימות מוחקת הקלטות ישנות, והקלטת
  // הכתובת היא לעיתים המקור היחיד לכתובת המשלוח. storage_path נשאר
  // ריק עד כה — ההקלטה הייתה תלויה לגמרי בימות.
  const recs = [
    ...(state.address_recording ? [{ kind: 'address' as const, path: state.address_recording,
      transcript: state.address_transcript ?? null }] : []),
    ...(state.name_recording ? [{ kind: 'name' as const, path: state.name_recording,
      transcript: state.name_transcript ?? null }] : []),
  ]

  // 🔴 הגיבוי שנעשה בזמן ההקלטה הוא מקור האמת.
  //
  // ⚠️ archiveRecording כאן כבר מאחר: הקובץ בימות נדרס מזמן (נתיב
  // קבוע לכל השיחות). הוא נשאר רק כנפילה-אחורה להזמנות שהתחילו לפני
  // התיקון, ואם יש גיבוי מהשיחה — הוא מנצח תמיד.
  const { data: stashed } = await supa.from('book_fair_call_recordings')
    .select('kind, storage_path, transcript').eq('call_id', callId)

  // ⚠️ מסומן על ההזמנה כדי שהמסך ימצא את ההקלטה גם לפי השיחה.
  await supa.from('book_fair_call_recordings')
    .update({ order_id: order.id }).eq('call_id', callId)

  const byKind = new Map((stashed ?? []).map(s => [String(s.kind), s]))

  const rows = await Promise.all(recs.map(async r => ({
    order_id: order.id,
    kind: r.kind,
    provider_path: r.path,
    // ⚠️ best-effort: כישלון העתקה אינו מפיל את ההזמנה.
    storage_path: byKind.get(r.kind)?.storage_path
      ?? await archiveRecording(order.id, r.kind, r.path),
    // ⚠️ גם התמלול נופל חזרה למה שנשמר בזמן השיחה.
    transcript: r.transcript ?? byKind.get(r.kind)?.transcript ?? null,
    transcript_source: (r.transcript || byKind.get(r.kind)?.transcript) ? 'yemot' : null,
  })))

  if (rows.length) await supa.from('book_fair_recordings').insert(rows)

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
    // 🔴 כאן, ורק כאן, מוקצה מספר ההזמנה: עד לרגע הזה השורה נושאת
    // מספר זמני (TMP-), כדי שמתקשר שנטש לא ישרוף מספר שהלקוח הבא
    // היה אמור לקבל.
    //
    // ⚠️ נבדק שהמספר עדיין זמני: הסליקה עשויה לדווח פעמיים על אותה
    // הזמנה, והקצאה חוזרת הייתה משנה את המספר שכבר נמסר ללקוח.
    const { data: cur } = await supa.from('book_fair_orders')
      .select('order_number').eq('id', orderId).maybeSingle()

    const patch: Record<string, unknown> = {
      status: 'paid',
      paid_at: new Date().toISOString(),
    }
    if (String(cur?.order_number ?? '').startsWith('TMP-')) {
      patch.order_number = await nextOrderNumber(supa)
    }

    await supa.from('book_fair_orders').update(patch).eq('id', orderId)
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

  // 🔴 באיזו שלוחה השיחה *באמת* רצה.
  //
  // ⚠️ ימות מנגנת f-<קובץ> מהתיקייה של השלוחה שבה השיחה נמצאת. קבצי
  // היריד הועלו לתיקייה 9 (YEMOT_BOOK_FAIR_EXT, ברירת מחדל), ואם
  // השיחה רצה בשלוחה אחרת — הקבצים פשוט אינם שם.
  //
  // זה נשאר עיוור כל היום: הקבצים אומתו קיימים ותקינים בתיקייה 9
  // (RIFF/WAVE 8kHz מונו), ובכל זאת כל שיחה עם f- נותקה מיד בעוד כל
  // שיחה עם t- עבדה — בדיוק מה שצפוי כשהנתיב שגוי.
  console.log(
    `[yemot-book-fair] ext=${params['ApiExtension'] ?? '?'} `
    + `expected=${process.env.YEMOT_BOOK_FAIR_EXT || '9'} callId=${callId}`,
  )

  // 🔴 כל הפרמטרים של שלב ההקלטה — כדי להפסיק לנחש את הנתיב.
  //
  // ⚠️ ימות מחזירה "30/9.wav", וכל הניסיונות להוריד אותו נכשלו. ייתכן
  // שהנתיב המלא יושב בפרמטר אחר שמעולם לא קראנו (ApiRecordFile,
  // ApiDirectory וכדומה) — ובלי לראות את *כל* מה שנשלח אי אפשר לדעת.
  //
  // ⚠️ מודפס רק בשלבי ההקלטה: הדפסת כל בקשה הייתה מציפה את הלוג,
  // וגם חושפת פרטי אשראי בשלב התשלום.
  if (params['bf_addr'] || params['bf_name']) {
    const safe = Object.fromEntries(
      Object.entries(params).filter(([k]) => !/card|cvv|token|valid/i.test(k)),
    )
    console.log(`[yemot-book-fair] פרמטרי הקלטה: ${JSON.stringify(safe)}`)
  }

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
    // ─────────────────────────────────────────────────────────────────
    // 🔴 nextTurn עובר מ-category_menu ל-browse *באותה קריאה* (בלי
    // round-trip נוסף לימות) ברגע שההקשה תקינה. בלי browseBooks כאן,
    // browseTurn מקבל רשימה ריקה ועונה "אין ספרים בקטגוריה זו" —
    // גם כשבקטגוריה יש ספרים. חישוב הקטגוריה הנבחרת כאן, באותו אופן
    // בדיוק שבו case 'category_menu' עושה זאת ב-IVR הטהור.
    // ─────────────────────────────────────────────────────────────────
    {
      const idx = Number(input.value) - 1
      if (Number.isInteger(idx) && idx >= 0 && idx < input.categories.length) {
        input.browseBooks = await listBooks(input.categories[idx])
      }
      // 🔴 לוג מפורש: "אין ספרים בקטגוריה זו" הוא התסמין היחיד שהמתקשר
      // שומע, ובלי זה אי אפשר לדעת אם ההקשה לא נקלטה, אם האינדקס חרג,
      // או אם השאילתה החזירה ריק.
      console.log(
        `[yemot-book-fair] cat pick="${input.value}" idx=${idx} `
        + `cats=${input.categories.length} books=${input.browseBooks?.length ?? 'לא נטען'} `
        + `name="${input.categories[idx] ?? '—'}" all=${JSON.stringify(input.categories)}`,
      )
    }
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
    // ⚠️ בסיס השם תלוי בכמה ספרים כבר בעגלה, והסיומת _r<סיבוב> עולה
    // בכל שאלה מחדש — ראו askSkuTurn ב-lib/bookFairYemotIvr.ts.
    // בלי הסיומת ימות מחזירה את המק"ט הקודם ו"להחלפת מק"ט" נתקע.
    const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
    const round = state.sku_round ?? 1
    const raw = params[`${skuBase}_r${round}`] || paramFor(params, skuBase)
    if (raw) {
      input.value = raw
      input.book = await findBook(raw)
    }
  } else if (state.step === 'ask_qty') {
    // ⚠️ שם תלוי-פריט — ראו ההערה ב-confirm_book. ה-fallback ל-bf_qty
    // קיים לשיחות שהתחילו לפני השינוי ועדיין פתוחות.
    const raw = paramFor(params, `bf_qty${state.items.length}`) || paramFor(params, 'bf_qty')
    if (raw) {
      input.value = raw
      // 🔴 הספר נקרא מ-pending_book_id שבמצב ולא מהפרמטרים.
      //
      // ⚠️ זה מה שתקע את שלב הכמות: הספר נשלף לפי שם משתנה המק"ט,
      // ואחרי שהשם קיבל סיומת _r<סיבוב> הערך לא נמצא — book יצא
      // null, וכל כמות נדחתה ב"הקישו מספר בין אחד ל…" בלולאה.
      //
      // ⚠️ המצב הוא המקור האמין: הספר כבר אושר בשלב confirm_book
      // ונשמר שם, ואין צורך לנחש אותו מחדש מההקשות.
      input.book = state.pending_book_id
        ? await findBookById(state.pending_book_id)
        : null
      if (input.book && Number.isInteger(Number(raw)) && Number(raw) > 0) {
        input.reserved = await reserveLastPreview(state, input.book, Number(raw))
      }
    }
  } else if (state.step === 'ask_more') {
    // ⚠️ תלוי-כמות — חייב להתאים לשם ב-readTap של nextTurn.
    input.value = paramFor(params, `bf_more${state.items.length}`)
    // ⚠️ "ספר נוסף" מחזיר לדפדוף למי שהגיע משם, ולכן הרשימה חייבת
    // להיטען כאן — אחרת browseTurn מקבל רשימה ריקה ועונה "אין ספרים".
    if (input.value === '1' && state.browse_category !== undefined) {
      input.browseBooks = await listBooks(state.browse_category ?? null)
    }
  } else if (state.step === 'ask_delivery') {
    input.value = paramFor(params, 'bf_deliv')
    // 🔴 מתקשר ששמע את התפריט רגע לפני שהאיסוף נסגר והקיש 1 — עובר
    // למשלוח. הזמנת איסוף כשהאיסוף סגור היא הזמנה שאי אפשר לספק.
    if (input.value === '1' && !(await pickupAvailable())) input.value = '2'
    // ⚠️ הרשימה נטענת כבר כאן: בחירה 2 עוברת ל-ask_city *באותה
    // קריאה*, ובלי הרשימה המתקשר שומע "לאיזו עיר" בלי האפשרויות.
    if (input.value === '2') input.cityList = await listCities()
  } else if (state.step === 'ask_city') {
    // ⚠️ גם בניסיון חוזר — הרשימה מוקראת שוב.
    input.cityList = await listCities()
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
    // ⚠️ השם תלוי במספר ההקלטה — חייב להתאים ל-readRecord של nextTurn.
    const base = addressVarBase(state.addr_take ?? 0)
    input.recording = paramFor(params, base)
    input.transcript = params[`${base}_voice`] || undefined
    // 🔴 מגובה *כאן ועכשיו*, ולא ביצירת ההזמנה.
    //
    // ⚠️ כל ההקלטות בשלוחה חולקות את אותו נתיב ("30/9.wav") — ימות
    // דורסת אותו בשיחה הבאה. הגיבוי ביצירת ההזמנה רץ דקות אחר כך,
    // אחרי התשלום, וכשהמתקשר הבא כבר הקליט — הקובץ שהועתק היה שלו
    // או שלא היה כלל. לקוח ששילם 839 ₪ נשאר בלי כתובת.
    input.heard = await stashRecording(callId, 'address', input.recording, input.transcript, params['ApiYFCallId'], params['ApiDID'], params['ApiPhone'], params['ApiTime'])
  } else if (state.step === 'confirm_address') {
    input.value = paramFor(params, confirmVarBase('addr', state.addr_take ?? 0))
  } else if (state.step === 'ask_name') {
    const base = nameVarBase(state.name_take ?? 0)
    input.recording = paramFor(params, base)
    input.transcript = params[`${base}_voice`] || undefined
    input.heard = await stashRecording(callId, 'name', input.recording, input.transcript, params['ApiYFCallId'], params['ApiDID'], params['ApiPhone'], params['ApiTime'])
  } else if (state.step === 'confirm_name') {
    input.value = paramFor(params, confirmVarBase('name', state.name_take ?? 0))
  } else if (state.step === 'confirm_total') {
    input.value = paramFor(params, 'bf_conf')
  } else if (state.step === 'payment') {
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 קוד ריק אינו כישלון — הוא "לא ידוע".
    //
    // ⚠️ כשהמתקשר מנתק באמצע הסליקה, או כשימות חוזרת מסיבה אחרת,
    // CreditCard_CODE חוזר ריק. הקוד סימן זאת כ'failed', ההזמנה
    // קיבלה "תשלום נכשל" והמלאי שוחרר — בעוד ייתכן שהחיוב דווקא
    // עבר אצל נדרים ואנחנו לא יודעים עליו.
    //
    // ⚠️ 121228 ו-121231 (651 ₪ כל אחת) סומנו כך, ושתיהן עם
    // error_message="CreditCard_CODE=" — כלומר ריק לגמרי.
    //
    // ללא קוד הסטטוס נשאר pending_payment, וההכרעה עוברת לאדם מול
    // הדוח של נדרים.
    // ─────────────────────────────────────────────────────────────────────
    const code = (params['CreditCard_CODE'] ?? '').trim()
    if (!code) {
      console.warn(`[yemot-book-fair] אין CreditCard_CODE — התוצאה לא ידועה. call=${callId}`)
      input.payment = undefined
    } else {
      input.payment = (code === '000' || code.toUpperCase() === 'OK') ? 'success' : 'failed'
    }
  }

  let turn = nextTurn(state, input, messages)

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 איסוף עצמי סגור (החלטת המשתמש 05.10: משלוח בלבד) — אותה הגדרה
  // בדיוק כמו באתר ('book_fair_pickup'), כדי ששני הערוצים לא יסתרו.
  //
  // השאלה "איסוף או משלוח" מדולגת: התור מורץ שוב כאילו הוקש 2 (משלוח),
  // וכך המתקשר שומע ישר את רשימת הערים. ⚠️ nextTurn נשאר טהור — ההכרעה
  // כאן, ב-route, ולא בתוכו.
  // ─────────────────────────────────────────────────────────────────────────
  if (turn.state.step === 'ask_delivery' && !(await pickupAvailable())) {
    turn = nextTurn(turn.state, { value: '2', cityList: await listCities() }, messages)
  }

  // ── עדכון המלאי בפועל אחרי תשובת "כמות" מוצלחת ──
  if (state.step === 'ask_qty' && input.reserved) {
    await reserveLastItem(turn.state, session.cart_token)
  }

  // ── שלב תשלום: יוצרים את ההזמנה (pending) ומחזירים credit_card= ──
  if (turn.response === '__CREDIT_CARD_PLACEHOLDER__') {
    const order = await createOrder(turn.state, session.cart_token, phone, callId)
    if (!order) {
      await saveSession(session.id, { ...turn.state, step: 'done' })
      return yemotText(`id_list_message=${msgToken(messages, 'order_error')}&go_to_folder=hangup`, callId)
    }
    // ─────────────────────────────────────────────────────────────────────
    // ⚠️ המספר הרץ *אינו* מוקצה כאן — ההזמנה נושאת TMP- עד
    // שהתשלום מאושר בפועל (finalizeOrder). מתקשר שלא השלים את
    // הסליקה אינו שורף מספר.
    //
    // ⚠️ המחיר: credit_card_remarks נשלח רק כשהמספר כבר נומרי,
    // כלומר בניסיון תשלום חוזר על אותה הזמנה. בדוח של נדרים
    // ההתאמה לניסיון הראשון היא לפי שעה וסכום.

    await saveSession(session.id, { ...turn.state, order_id: order.id, order_number: order.order_number }, order.id)
    const total = turn.state.items.reduce((s, i) => s + i.price_agorot * i.quantity, 0) + (turn.state.shipping_agorot ?? 0)
    const shekels = (Math.round(total) / 100).toFixed(2)
    // ⚠️ הפרמטרים הקבועים (סוג סליקה, מספר מוסד, קטגוריה, ApiValid)
    // מוגדרים בממשק ניהול השלוחה בימות עצמה — לא כאן. billing_sum הוא
    // הדבר היחיד שמשתנה מהזמנה להזמנה, ולכן הוא היחיד שנשלח דינמית.
    //
    // 🔴 הודעת מעבר לפני הסליקה: משורת credit_card= והלאה *ימות*
    // מקריאה את ההנחיות (מספר כרטיס, תוקף, שלוש ספרות, ת"ז) בקול
    // משלה. בלי ההודעה הזו המתקשר שמע מעבר פתאומי לקול אחר, באמצע
    // שיחה, בלי שום הסבר — בדיוק ברגע הרגיש שבו הוא מוסר פרטי אשראי.
    //
    // ⚠️ ההנחיות עצמן אינן ניתנות לעריכה כאן והן נערכות בממשק ימות:
    // פרטי הכרטיס הגולמיים לעולם אינם עוברים דרך השרת שלנו.
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 "אין מספר מסוף" — ההגדרות חסרות בממשק השלוחה בימות.
    //
    // הפורמט כאן תקין (ראו yemot-api-module-protocol):
    //   credit_card=<סוג סליקה>,<סכום>,<מספר חנות>,<תשלומים>,<מטבע>
    //
    // ⚠️ אבל הפקודה לבדה אינה מספיקה: ימות דורשת שההגדרות הבאות
    // יהיו מוגדרות בממשק ניהול השלוחה, אחרת היא עונה "אין מספר מסוף"
    // עוד לפני שהיא פונה לנדרים —
    //   credit_card_type=nedarim_plus
    //   credit_card_terminal_number=7004562
    //   credit_card_category_nedarim_plus=צאצאי מרן החתם סופר
    //   nedarim_plus_ApiValid=<הסוד>
    //   credit_card_max_tashloumim=1 · credit_card_currency=1
    //
    // ⚠️ הקטגוריה נקבעת שם בלבד ואינה ניתנת לשליחה בפקודה.
    // ─────────────────────────────────────────────────────────────────────
    const intro = msgToken(messages, 'payment_intro')
    return yemotText(
      [
        intro ? `id_list_message=${intro}` : '',
        // 🔴 מספר ההזמנה נשלח כ-remarks, ומגיע לדוח של נדרים ולמייל
        // הקבלה. בלעדיו שורת התשלום שם נושאת רק "Yemot-093130924.2302"
        // — מזהה פנימי של ימות — ואי אפשר לקשר אותה להזמנה אצלנו אלא
        // בניחוש לפי שעה וסכום.
        //
        // ⚠️ ספרות בלבד ועד 8 (מגבלת addData בנדרים): המספר הרץ שלנו
        // הוא 6 ספרות ונכנס, אבל TMP-<cart> אינו — ולכן נשלח רק כשהוא
        // נומרי.
        ...(/^\d{1,8}$/.test(String(order.order_number ?? ''))
          ? [`credit_card_remarks=${order.order_number}`]
          : []),
        // 🔴 credit_card_comment הוסר — ערך ריק שובר את הסליקה.
        //
        // ⚠️ הוא נוסף ב-00:20 כדי להסיר את ההערה האוטומטית של ימות
        // ("Yemot-093130924.2302"), ומאותו רגע *כל* תשלום טלפוני נכשל:
        // 121228, 121231 ו-121232 — בעוד 121227 שלפניו עבר, ושתי
        // הזמנות אתר באותן דקות עברו גם הן.
        //
        // ⚠️ ימות מצפה לערך; פרמטר ריק נקרא כפקודה פגומה. אם נרצה
        // להסיר את ההערה — זה בהגדרות השלוחה (ext.ini), לא כאן, ורק
        // אחרי בדיקה בשיחה אמיתית.
        `credit_card=nedarim_plus,${shekels},${NEDARIM_TERMINAL},1,1`,
      ].filter(Boolean).join('&'),
      callId,
    )
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
