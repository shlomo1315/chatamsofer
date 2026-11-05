// נתוני השיחה של היריד בטכנוליין: עגלה, ספרים, הזמנות, פניות והקלטות.
//
// 🔴 הפרדה מוחלטת: אין כאן אף קריאה למערכת טלפון אחרת ולא לטוקן שלה.
// הקלטות יורדות מטכנוליין במפתח של מערכת היריד בלבד (getSystem('yerid')).
// הטבלאות (ספרים, מלאי, הזמנות, פניות) משותפות במכוון — יריד אחד, ערוץ
// טלפוני חדש — ולכן ההזמנות מופיעות באותו מסך הזמנות.
//
// ⚠️ מזהה השיחה נשמר עם הקידומת tl:yerid: כדי ששיחת טכנוליין לא תתנגש
// לעולם בשיחה ישנה של המרכזיה באותה טבלה.
//
// רוב הפונקציות הועתקו מהשלוחה הקודמת של היריד (שאינו
// משתנה), בלי ההורדות מהמרכזיה ובלי שמות הקבצים של הקלטות הספרים במרכזיה.
import { loadAgreedTiers } from '@/lib/bookFairAgreedRates'
import { getServiceClient } from '@/lib/apiAuth'
import { nextOrderNumber, makeCartToken } from '@/lib/bookFairCheckout'
import { shippingCost } from '@/lib/bookFairShipping'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { categoryOrder } from '@/lib/bookFairCatalog'
import { digitsOnly, matchBookBySku } from '@/lib/bookFairSkuMatch'
import { BOOK_FAIR_STATUS_LABELS, type BookFairOrderStatus } from '@/types/bookFair'
import { initialState, ttsClean, type IvrState } from '@/lib/bookFairPhoneFlow'
import { transcribeHebrew } from '@/lib/elevenStt'
import { PICKUP_CONFIG_KEY, mergePickupConfig, pickupStatus } from '@/lib/bookFairPickup'
import { inquiryStorageKey } from '@/lib/bookFairInquiryAudio'
import { hebrewNumbersToDigits } from '@/lib/hebrewNumbers'
import { getSystem } from '../systems'

/** מסוף נדרים של היריד בשיחה (ברירת מחדל: המסוף שהיה מוגדר במרכזיה). */
export function yeridTerminal(): string {
  const t = process.env.TECHNOLINE_YERID_NEDARIM_TERMINAL?.trim()
  return t && /^\d+$/.test(t) ? t : '7004562'
}

/** מזהה שיחה בטבלאות היריד — עם קידומת, כדי שלא יתנגש בשיחות המרכזיה. */
export function yeridCallId(pbxCallId: string): string {
  return `tl:yerid:${pbxCallId}`
}

/** כתובת מתומללת ← ספרות במקום מספרים במילים (lib/hebrewNumbers). */
function addrDigits(s: string | null | undefined): string | null {
  return s ? hebrewNumbersToDigits(s) : null
}

function db() {
  return getServiceClient()
}

/** state של השיחה + מונה הפניות לטכנוליין (סיומת _q<seq> לשמות המשתנים). */
export type TlIvrState = IvrState & { tl_seq?: number }

export type CallSession = { id: string; state: TlIvrState; cart_token: string; order_id: string | null }

export async function loadSession(callId: string, phone: string): Promise<CallSession> {
  const supa = db()!
  const { data } = await supa.from('book_fair_call_sessions')
    .select('id, state, cart_token, order_id').eq('call_id', callId).maybeSingle()
  if (data) {
    return {
      id: data.id as string,
      state: data.state as TlIvrState,
      cart_token: data.cart_token as string,
      order_id: data.order_id as string | null,
    }
  }
  const cartToken = makeCartToken()
  const { data: created, error } = await supa.from('book_fair_call_sessions')
    .insert({ call_id: callId, phone, state: initialState(), cart_token: cartToken, step: 'welcome' })
    .select('id, state, cart_token, order_id').single()
  if (error || !created) throw new Error(`יצירת שיחה נכשלה: ${error?.message ?? 'ללא שורה'}`)
  return {
    id: created.id as string,
    state: created.state as TlIvrState,
    cart_token: created.cart_token as string,
    order_id: created.order_id as string | null,
  }
}

export async function saveSession(sessionId: string, state: TlIvrState, orderId?: string) {
  await db()!.from('book_fair_call_sessions')
    .update({ state, step: state.step, ...(orderId ? { order_id: orderId } : {}) })
    .eq('id', sessionId)
}

export async function deleteSession(callId: string) {
  await db()!.from('book_fair_call_sessions').delete().eq('call_id', callId)
}

/**
 * הורדת הקלטה מטכנוליין לפי FILEID, במפתח של מערכת היריד בלבד.
 * ⚠️ best-effort עם תקרת זמן: שיחה חיה לא מחכה להורדה תקועה.
 */
export async function downloadTlRecording(fileId: string | undefined): Promise<ArrayBuffer | null> {
  const apiKey = getSystem('yerid').apiKey
  if (!fileId || !apiKey) return null
  try {
    const url = `https://api.tlivr.com/ivrFilesApi.php?action=fileDownload&audio=${encodeURIComponent(fileId)}&apiKey=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok || ct.includes('json')) return null
    const buf = await res.arrayBuffer()
    return buf.byteLength > 500 ? buf : null
  } catch (e) {
    console.warn('[tl-yerid] הורדת הקלטה נכשלה:', e instanceof Error ? e.message : e)
    return null
  }
}

export type TlRecording = { fileId?: string; path?: string; text?: string }

/**
 * שמירת פנייה לשירות לקוחות + עותק ההקלטה אצלנו.
 * ⚠️ מחזירה false ולא זורקת: כשל שמירה נשמע למתקשר כ"לא נקלט".
 */
export async function saveInquiry(phone: string, rec: TlRecording, callId: string): Promise<boolean> {
  const supa = db()!
  const cleanPhone = String(phone ?? '').replace(/\D/g, '') || 'לא ידוע'
  const { error } = await supa.from('book_fair_inquiries').insert({
    phone: cleanPhone,
    recording: rec.path || rec.fileId || 'technoline',
    transcript: rec.text?.trim() || null,
    call_id: callId || null,
  })
  if (error) {
    console.error('[tl-yerid] שמירת הפנייה נכשלה:', error.message)
    return false
  }
  // ⚠️ ברקע: המתקשר לא ממתין להורדה.
  void (async () => {
    const data = await downloadTlRecording(rec.fileId)
    if (!data) return
    const up = await supa.storage.from('documents')
      .upload(inquiryStorageKey(callId), data, { contentType: 'audio/mpeg', upsert: true })
    if (up.error) console.warn('[tl-yerid] העלאת הקלטת פנייה נכשלה:', up.error.message)
  })()
  return true
}

/**
 * גיבוי הקלטת כתובת/שם מיד כשהיא נקלטת, ותמלול להקראה למתקשר.
 * מחזיר את התמלול (ElevenLabs על הקובץ, ואם אין — התמלול של טכנוליין).
 * ⚠️ best-effort מוחלט: כישלון לעולם אינו מפיל את השיחה.
 */
export async function stashRecording(
  callId: string, kind: 'address' | 'name', rec: TlRecording,
): Promise<string | undefined> {
  if (!rec.fileId && !rec.path) return rec.text
  try {
    const supa = db()
    if (!supa) return rec.text
    const data = await downloadTlRecording(rec.fileId)
    let heard: string | undefined
    if (data) {
      const t0 = Date.now()
      heard = (await transcribeHebrew(data, { timeoutMs: 6000, filename: `${kind}.mp3` })) ?? undefined
      console.log(`[tl-yerid/stt] ${kind} ${Date.now() - t0}ms ${heard ? 'תומלל' : 'ללא תמלול'} call=${callId}`)
    }
    heard = heard || rec.text?.trim() || undefined
    const key = data ? `book-fair/calls/${callId}/${kind}.mp3` : null
    if (data && key) {
      const up = await supa.storage.from('documents').upload(key, data, { contentType: 'audio/mpeg', upsert: true })
      if (up.error) console.warn('[tl-yerid] העלאת הקלטה נכשלה:', up.error.message)
    }
    await supa.from('book_fair_call_recordings').upsert({
      call_id: callId,
      kind,
      provider_path: rec.path || rec.fileId || null,
      storage_path: key,
      transcript: kind === 'address' ? addrDigits(heard) : (heard ?? null),
    }, { onConflict: 'call_id,kind' })
    return heard
  } catch (e) {
    console.warn('[tl-yerid] גיבוי הקלטה נכשל:', e)
    return rec.text
  }
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
export async function findBook(sku: string) {
  const digits = digitsOnly(sku)
  if (!digits) return null

  const supa = db()!
  // 🔴 audio_name מוחזר null: הקלטות הספרים שמורות במרכזיה, ובטכנוליין שם הספר מוקרא ב-TTS.
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
    audio_name: null,
  }
}

/** ספר לפי מזהה — לאישור ספר שכבר הוצע. */
export async function findBookById(id: string) {
  const supa = db()!
  const { data } = await supa.from('book_fair_books')
    .select('id, sku, title, price_agorot, stock_total, unlimited_stock, audio_name')
    .eq('id', id).eq('is_active', true).maybeSingle()
  if (!data) return null
  return {
    id: data.id, sku: data.sku, title: data.title, price_agorot: data.price_agorot,
    in_stock: data.unlimited_stock === true || (data.stock_total ?? 0) > 0,
    // 🔴 כמו ב-listBooks: ההקלטות במרכזיה, ולכן TTS.
    audio_name: null,
  }
}

/**
 * שמות הקטגוריות לפי סדר הקטלוג.
 *
 * ⚠️ הקטגוריה יושבת ב-description (כך הגיעה מהאקסל), והסדר נגזר
 * מקידומת המק"ט — בדיוק כמו בחנות.
 */
export async function listCategories(): Promise<string[]> {
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
export async function listBooks(category: string | null) {
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
    // 🔴 הקלטות הספרים הקיימות שמורות במרכזיה ולא בטכנוליין, ולכן כאן שם הספר מוקרא ב-TTS.
    audio_name: null,
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
export async function listMyOrders(phone: string) {
  const supa = db()!
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return []

  // 🔴 המרכזיה מעבירה את המספר בכמה צורות: "0533157835", "533157835"
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
    // בתחביר הטוקנים של המרכזיה ושובר את ההודעה כולה.
    status: ttsClean(
      BOOK_FAIR_STATUS_LABELS[o.status as BookFairOrderStatus] ?? 'בטיפול',
    ),
  }))
}


export async function findCity(phoneCode: string) {
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
export async function listCities() {
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

/**
 * מספר הכרכים של כל ספר בעגלה, מהקטלוג.
 *
 * 🔴 13.10: עד כאן כל ספר נספר ככרך אחד — "שו״ת חתם סופר" (6 כרכים) חויב
 * משלוח כמו חוברת. 225 הזמנות טלפוניות חויבו כך.
 * ⚠️ נשלף מהקטלוג ולא נשמר במצב השיחה: מצב השיחה נשמר כ-JSON, ושינוי צורתו
 * באמצע עונה שובר שיחות פתוחות.
 */
export async function volumesByBook(bookIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!bookIds.length) return out
  const { data } = await db()!.from('book_fair_books').select('id, volumes').in('id', bookIds)
  for (const b of data ?? []) out.set(String(b.id), Math.max(1, Number(b.volumes) || 1))
  return out
}

export async function shippingFor(volumeCount: number): Promise<number | null> {
  return shippingCost('shipping', volumeCount, await loadAgreedTiers(db()! as never))
}

/** שריון מלאי לפריט האחרון שנוסף לעגלה — ⚠️ לא לכל העגלה: הפריטים
 *  הקודמים כבר משוריינים משלב קודם בשיחה. */
export async function reserveLastItem(state: IvrState, cartToken: string): Promise<boolean> {
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

/** האם האיסוף העצמי פתוח כרגע — לפי אותה הגדרה שהאתר קורא. */
export async function pickupAvailable(): Promise<boolean> {
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
export async function createOrder(state: IvrState, cartToken: string, phone: string, callId: string): Promise<{ id: string; order_number: string } | null> {
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
    // ⚠️ בטלפון הכתובת מגיעה מהקלטה, לא מהקלדה.
    // 🔢 נשמרת עם ספרות; ההקראה למתקשר בשיחה נשארת מהתמלול המקורי.
    address_text: state.delivery === 'shipping' ? addrDigits(state.address_transcript) : null,
    // 🔴 מאומתת רק כשהמתקשר שמע את התמלול והקיש 1 (החלטת המשתמש 05.10).
    // בלי תמלול, או כשנגמרו ההקלטות בלי אישור — ממתינה לאימות במשרד.
    address_confirmed: state.delivery === 'shipping' && state.address_caller_confirmed === true,
    items_total_agorot: itemsTotal,
    shipping_agorot: shipping,
    total_agorot: itemsTotal + shipping,
  }).select('id, order_number').single()
  if (error || !order) {
    console.error('[tl-yerid] order insert failed:', error)
    return null
  }

  // ⚠️ volumes_snapshot — בלעדיו כל סט נשמר ככרך אחד, וסיכום הכרכים
  // בתעודת המשלוח מציג ארגז קטן מהאמיתי.
  const vols = await volumesByBook(state.items.map(i => i.book_id))
  await supa.from('book_fair_order_items').insert(
    state.items.map(i => ({
      order_id: order.id, book_id: i.book_id, title_snapshot: i.title, sku_snapshot: i.sku,
      volumes_snapshot: vols.get(i.book_id) ?? 1,
      unit_price_agorot: i.price_agorot, quantity: i.quantity,
      line_total_agorot: i.price_agorot * i.quantity,
    }))
  )

  await supa.from('book_fair_reservations')
    .update({ order_id: order.id }).eq('cart_token', cartToken).eq('status', 'held')

  // ⚠️ ההקלטות (כתובת/שם) משויכות להזמנה כאן — עד עכשיו היו שייכות רק
  // ל-call_id, וכרטיס ההזמנה לא היה מוצא אותן בלי השיוך המפורש הזה.
  //
  // 🔴 וגם מועתקות לאחסון שלנו: המרכזיה מוחקת הקלטות ישנות, והקלטת
  // הכתובת היא לעיתים המקור היחיד לכתובת המשלוח. storage_path נשאר
  // ריק עד כה — ההקלטה הייתה תלויה לגמרי במרכזיה.
  const recs = [
    ...(state.address_recording ? [{ kind: 'address' as const, path: state.address_recording,
      transcript: addrDigits(state.address_transcript) }] : []),
    ...(state.name_recording ? [{ kind: 'name' as const, path: state.name_recording,
      transcript: state.name_transcript ?? null }] : []),
  ]

  // 🔴 הגיבוי שנעשה בזמן ההקלטה הוא מקור האמת.
  //
  // ⚠️ archiveRecording כאן כבר מאחר: הקובץ במרכזיה נדרס מזמן (נתיב
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
      ?? null,
    // ⚠️ גם התמלול נופל חזרה למה שנשמר בזמן השיחה.
    transcript: r.transcript ?? byKind.get(r.kind)?.transcript ?? null,
    transcript_source: (r.transcript || byKind.get(r.kind)?.transcript) ? 'technoline' : null,
  })))

  if (rows.length) await supa.from('book_fair_recordings').insert(rows)

  return { id: order.id, order_number: order.order_number }
}

/** סימון תוצאת התשלום — מצליח: paid + פתיחת book_fair_payments; נכשל: משחרר שריון. */
export async function finalizeOrder(orderId: string, cartToken: string, code: string, confirmation?: string) {
  const supa = db()!
  // ⚠️ טכנוליין מחזירה OK במודול creditCard; '000' נשאר כקוד אישור של נדרים.
  const ok = code === '000' || code.toUpperCase() === 'OK'

  const { data: order } = await supa.from('book_fair_orders')
    .select('order_number, total_agorot').eq('id', orderId).maybeSingle()

  await supa.from('book_fair_payments').insert({
    order_id: orderId,
    provider: `nedarim_technoline:yerid:${yeridTerminal()}`,
    amount_agorot: Number(order?.total_agorot ?? 0),
    status: ok ? 'success' : 'failed',
    transaction_id: confirmation || null,
    error_message: ok ? null : `creditCard=${code}`,
  })

  if (ok) {
    // 🔴 כאן, ורק כאן, מוקצה מספר ההזמנה: עד לרגע הזה השורה נושאת
    // מספר זמני (TMP-), כדי שמתקשר שנטש לא ישרוף מספר שהלקוח הבא
    // היה אמור לקבל.
    //
    // ⚠️ נבדק שהמספר עדיין זמני: הסליקה עשויה לדווח פעמיים על אותה
    // הזמנה, והקצאה חוזרת הייתה משנה את המספר שכבר נמסר ללקוח.
    const patch: Record<string, unknown> = {
      status: 'paid',
      paid_at: new Date().toISOString(),
    }
    if (String(order?.order_number ?? '').startsWith('TMP-')) {
      patch.order_number = await nextOrderNumber(supa)
    }

    // 🔴 עדכון מותנה (ביקורת אבטחה 07.10): דיווח כפול או מאוחר לא יחזיר
    // הזמנה שבוטלה / זוכתה / נשלחה למצב "שולם". failed נכלל: מתקשר שכרטיסו
    // נדחה ומקיש כרטיס אחר באותה שיחה — ההזמנה כבר סומנה נכשלה.
    const { data: upd } = await supa.from('book_fair_orders').update(patch).eq('id', orderId)
      .in('status', ['pending_payment', 'failed']).select('id')
    // 🔴 כסף שנגבה על הזמנה שכבר בוטלה/זוכתה — לא מסמנים "שולם", אבל חייבים
    // שמישהו יידע: הלקוח חויב. הרישום ב-book_fair_payments (success) כבר נעשה.
    if (!upd?.length) {
      console.error(`[tl-yerid] 🔴 תשלום מוצלח על הזמנה שאינה ממתינה לתשלום — לבדוק ולזכות ידנית · order=${orderId}`)
    }
  } else {
    // ⚠️ רק מהמתנה לתשלום: סירוב שמגיע אחרי הצלחה לא יבטל הזמנה ששולמה.
    await supa.from('book_fair_orders').update({ status: 'failed' }).eq('id', orderId)
      .eq('status', 'pending_payment')
    await supa.rpc('book_fair_release', { p_cart_token: cartToken })
      .then(undefined, () => { /* best-effort — הפקיעה תתפוס בכל מקרה */ })
  }
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
export async function reserveLastPreview(
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
