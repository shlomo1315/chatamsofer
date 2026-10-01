// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — מכונת המצבים של השיחה הטלפונית (מודול API של ימות המשיח).
//
// 🔴 הקובץ טהור לחלוטין: בלי רשת, בלי מסד, בלי תאריכים. הוא מקבל מצב
// וקלט, ומחזיר מצב חדש ותשובת טקסט לימות. זו הסיבה שאפשר לבדוק כאן
// *מה המתקשר שומע* — הדבר היחיד שבאמת חשוב, ושאי אפשר לראות בשום לוג
// אחרי שהוא ניתק.
//
// ⚠️ שונה מ-lib/bookFairIvr.ts (המקביל לטכנוליין, יתום ולא מחובר לשום
// route): כאן הפלט הוא הפרוטוקול הטקסטואלי של ימות
// (id_list_message=/read=/go_to_folder=) ולא JSON. ראו התיעוד שנאסף
// ב-docs/memory: "yemot-api-module-protocol" ו-"yemot-nedarim-credit-card-module".
//
// 🔴 הסליקה עצמה אינה כאן: כשמגיע שלב התשלום, התשובה מחזירה
// credit_card=... וימות עצמה מנהלת את כל שיחת הסליקה מול נדרים
// (הקשת כרטיס/תוקף/CVV) — פרטי הכרטיס הגולמיים אינם עוברים דרכנו
// אף פעם. אנחנו רק מקבלים בחזרה CreditCard_CODE עם התוצאה.
// ─────────────────────────────────────────────────────────────────────────────

import { agorotToSpokenShekels } from './bookFairPricing'

// ── TTS ──────────────────────────────────────────────────────────────────────

/**
 * ⚠️ TTS של ימות (t-) אסור שיכיל נקודה (.) או מקף (-): אלה תווי המפריד
 * בתחביר הטוקנים עצמו (t-כך.f-כך, וכן d-1-2). גרש/גרשיים מנוקים גם הם
 * כדי שלא ישברו הקראת שם ספר ("שו״ת").
 */
export function ttsClean(text: string): string {
  return String(text ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/["'״׳`|&]/g, ' ')
    .replace(/[.\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const t = (text: string): string => `t-${ttsClean(text)}`
const n = (num: string | number): string => `n-${num}`
const d = (digits: string): string => `d-${digits}`
const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')

// ── תשובות לימות (טקסט גולמי) ────────────────────────────────────────────────

/** אפשרויות read משותפות. ⚠️ שם המשתנה חדש בכל ניסיון — ראו retry(). */
interface ReadOpts {
  max?: number | ''
  min?: number
  seconds?: number
  /** אופן הקראה — Number/Digits/NO וכו'. ברירת מחדל Digits. */
  readAs?: string
}

function readTap(varName: string, promptTokens: string[], opts: ReadOpts = {}): string {
  const { max = '', min = 1, seconds = 12, readAs = 'Digits' } = opts
  // read=<הודעה>=<שם>,<שימוש בקיים>,<max>,<min>,<שניות>,<אופן הקראה>,<חסום כוכבית>,<אפס אסור>,<תו החלפה>,<מקשים מותרים>,<חזרות>,<Ok>,<טקסט ריק>
  const ops = [varName, 'yes', String(max), String(min), String(seconds), readAs, '', '', '', '', '', '', '']
  return `read=${joinTokens(...promptTokens)}=${ops.join(',')}`
}

/** הקלטה (record) — נשמרת בתיקיית ImportRecord/ApiRecord של ימות ומוחזר שם קובץ. */
function readRecord(varName: string, promptTokens: string[], maxSeconds = 30): string {
  // read=<הודעה>=<שם>,,voice — סוג record עם תמלול-רקע (voice), לא record גרידא:
  // כך גם מתקבל טקסט תמלול (best-effort) וגם קובץ ההקלטה נשמר.
  const ops = [varName, '', 'record', String(maxSeconds), '9']
  return `read=${joinTokens(...promptTokens)}=${ops.join(',')}`
}

const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`
const hangup = 'go_to_folder=hangup'

export type IvrResponse = string

// ── מצב השיחה ────────────────────────────────────────────────────────────────

export type IvrStep =
  | 'welcome'
  | 'ask_sku'
  | 'ask_qty'
  | 'ask_more'
  | 'ask_delivery'
  | 'ask_city'
  | 'record_address'
  | 'ask_name'
  | 'confirm_total'
  | 'payment'
  | 'done'

export interface IvrCartItem {
  book_id: string
  sku: string
  title: string
  price_agorot: number
  quantity: number
}

export interface IvrState {
  step: IvrStep
  items: IvrCartItem[]
  delivery?: 'pickup' | 'shipping'
  city_id?: string
  city_name?: string
  address_recording?: string
  address_transcript?: string
  name_recording?: string
  name_transcript?: string
  shipping_agorot?: number
  order_id?: string
  order_number?: string
  /** ⚠️ סיומת שם המשתנה בניסיון הנוכחי — קריאה חוזרת של משתנה מלא
   *  יוצרת לולאה אינסופית בימות (אותה מלכודת שתועדה בכל שלוחות ימות
   *  הקיימות בפרויקט). */
  attempts: number
}

export function initialState(): IvrState {
  return { step: 'welcome', items: [], attempts: 0 }
}

// ── קלט ──────────────────────────────────────────────────────────────────────

export interface IvrInput {
  value?: string
  book?: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean } | null
  city?: { id: string; name: string } | null
  shipping_agorot?: number | null
  reserved?: boolean
  recording?: string
  transcript?: string
  /** תוצאת הסליקה — מגיעה מ-CreditCard_CODE בבקשה החוזרת מימות. */
  payment?: 'success' | 'failed'
  order_number?: string
}

export interface IvrTurn {
  state: IvrState
  response: IvrResponse
}

const MAX_ATTEMPTS = 3
const MAX_QTY = 20

const totalOf = (items: IvrCartItem[]) =>
  items.reduce((s, i) => s + i.price_agorot * i.quantity, 0)

// ── נוסחים ועריכתם ───────────────────────────────────────────────────────────
//
// 🔴 הנוסחים אינם מוטמעים כאן יותר: הם נשלפים ב-route מ-app_settings
// (lib/yemotBookFairMessages) ומוזנים פנימה. הקובץ נשאר *טהור* — הוא
// אינו ניגש למסד — וזו הסיבה שאפשר להמשיך לבדוק כאן מה המתקשר שומע.
//
// ⚠️ חסר נוסח ⇒ ברירת המחדל שבקוד, ולא מחרוזת ריקה. הודעה ריקה בטלפון
// היא שתיקה — המתקשר אינו יודע מה לעשות ומנתק.

/** נוסח להודעה אחת, כפי שהוא מגיע מההגדרות. */
export interface IvrMsg { text: string; audio?: string | null }
export type IvrMessages = Record<string, IvrMsg>

/**
 * טוקן ההשמעה להודעה: הקלטה אם קיימת, אחרת TTS של הטקסט.
 *
 * 🔴 ההקלטה גוברת על הטקסט — זו המלכודת שתפסה אותנו בעבר. עריכת
 * הטקסט בלי להסיר הקלטה ישנה אינה משנה דבר במה שנשמע בטלפון.
 *
 * ⚠️ המשתנים ({title} וכו') מוחלפים *לפני* ניקוי ה-TTS, ולכן שם ספר
 * שמכיל נקודה או גרשיים אינו שובר את תחביר הטוקנים.
 *
 * ⚠️ שדה שלא הוחלף נוקה מהנוסח: "במוקד {name}" בלי החלפה הוקרא בעבר
 * כ"במוקד סוגריים ניים" באוזני המתקשר.
 */
export function msgToken(
  messages: IvrMessages | undefined,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const fallback = MESSAGE_FALLBACKS[key] ?? ''
  const m = messages?.[key]
  const raw = (typeof m?.text === 'string' && m.text.trim()) ? m.text : fallback

  // הקלטה אנושית/נוירונית — רק כשאין משתנים להחליף (קובץ אחד אינו
  // יכול להקריא ערך משתנה).
  if (m?.audio && !vars) return `f-${m.audio}`

  let out = raw
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v))
    }
  }
  // ⚠️ ניקוי שדות שלא הוחלפו, אחרי ההחלפה.
  out = out.replace(/\{[^}]*\}/g, ' ')
  return t(out)
}

/**
 * ברירות המחדל — מקור אמת אחד עם lib/yemotBookFairMessages.
 *
 * ⚠️ מוגדרות כאן ולא מיובאות משם: הייבוא היה גורר את getServiceClient
 * לתוך מודול שחייב להישאר טהור וניתן לבדיקה בלי מסד. טסט משותף
 * (bookFairYemotMessages.test.ts) מוודא שהשתיים אינן נפרדות.
 */
export const MESSAGE_FALLBACKS: Record<string, string> = {
  welcome: 'ברוכים הבאים ליריד הספרים של היכל החתם סופר',
  ask_sku: 'להזמנת ספר הקישו את מספר הקטלוג ולאחריו סולמית',
  closed: 'היריד סגור כרגע להזמנות',
  sku_not_found: 'מספר הקטלוג שהקשתם לא נמצא',
  sku_retry: 'נסו שוב או המתינו לנציג',
  book_sold_out: 'הספר {title} אזל מהמלאי',
  ask_sku_other: 'הקישו מספר קטלוג אחר',
  price_word: 'מחיר',
  shekels_word: 'שקלים',
  ask_qty: 'כמה עותקים הקישו מספר ולאחריו סולמית',
  qty_invalid: 'הקישו מספר בין אחד ל{max}',
  qty_unavailable: 'מצטערים הכמות המבוקשת אינה זמינה',
  added_to_cart: 'נוספו לסל {qty} עותקים של {title}',
  ask_more: 'להוספת ספר נוסף הקישו אחת לסיום ההזמנה הקישו שתיים',
  ask_more_retry: 'הקישו אחת להוספת ספר או שתיים לסיום',
  ask_next_sku: 'הקישו את מספר הקטלוג של הספר הבא',
  ask_delivery: 'לאיסוף עצמי מהיריד הקישו אחת למשלוח עד הבית הקישו שתיים',
  ask_delivery_retry: 'הקישו אחת לאיסוף עצמי או שתיים למשלוח',
  ask_city: 'הקישו את קוד העיר שאליה יישלחו הספרים',
  city_unknown: 'קוד העיר שהקשתם אינו מוכר',
  city_list_only: 'משלוחים מתבצעים לערים שבמוקד בלבד הקישו קוד עיר אחר',
  shipping_unavailable: 'לא ניתן לחשב את דמי המשלוח להזמנה זו',
  call_office: 'אנא התקשרו למשרד להשלמת ההזמנה',
  shipping_to: 'משלוח ל{city}',
  ask_address: 'אמרו את הרחוב מספר הבית ומספר הדירה ולאחר מכן הקישו סולמית',
  no_recording: 'לא נקלטה הקלטה נסו שוב',
  ask_name: 'אמרו את שמכם המלא ולאחר מכן הקישו סולמית',
  no_name_recording: 'לא נקלטה הקלטה אמרו את שמכם המלא',
  total_books: 'סך ההזמנה',
  for_books: 'שקלים עבור הספרים',
  plus_shipping: 'ועוד',
  shipping_fee_word: 'שקלים דמי משלוח',
  no_shipping_fee: 'ללא דמי משלוח',
  grand_total: 'סך הכל לתשלום',
  ask_pay: 'לתשלום בכרטיס אשראי הקישו אחת לביטול ההזמנה הקישו שתיים',
  ask_pay_retry: 'הקישו אחת לתשלום או שתיים לביטול',
  cancelled: 'ההזמנה בוטלה תודה ולהתראות',
  paid_ok: 'התשלום התקבל בהצלחה',
  order_number: 'מספר ההזמנה שלכם',
  goodbye: 'תודה ויום טוב',
  paid_fail: 'התשלום לא אושר',
  paid_fail_retry: 'ההזמנה לא נקלטה ניתן לנסות שוב או לפנות למשרד',
  order_error: 'שגיאה ביצירת ההזמנה אנא פנו למשרד',
  input_error: 'לא הצלחנו לקלוט את הבחירה',
  server_error: 'שגיאת שרת',
}

// ── מכונת המצבים ─────────────────────────────────────────────────────────────

/**
 * הצעד הבא בשיחה.
 *
 * 🔴 טהורה: אותו (state, input, messages) יחזיר תמיד אותה תוצאה. כל
 * פעולה שדורשת מסד — חיפוש ספר, שריון, יצירת הזמנה, *וגם שליפת
 * הנוסחים* — נעשית בשכבה שמעל (ה-route) ומוזנת פנימה.
 *
 * ⚠️ messages אופציונלי: בלעדיו נעשה שימוש בברירות המחדל שבקוד, ולכן
 * כשל בשליפת הנוסחים אינו משתיק את השלוחה.
 */
export function nextTurn(state: IvrState, input: IvrInput = {}, messages?: IvrMessages): IvrTurn {
  const m = (key: string, vars?: Record<string, string | number>) => msgToken(messages, key, vars)

  switch (state.step) {

    case 'welcome':
      return {
        state: { ...state, step: 'ask_sku', attempts: 0 },
        response: readTap('bf_sku', [
          m('welcome'),
          m('ask_sku'),
        ], { max: 10, seconds: 10 }),
      }

    case 'ask_sku': {
      // ⚠️ בסיס שם המשתנה תלוי בכמה ספרים כבר בעגלה: 'bf_sku' לספר
      // הראשון, 'bf_sku_next<n>' לכל ספר נוסף — כדי ש-read על הספר
      // השני לא יתנגש עם ה-read שכבר נענה על הספר הראשון באותה שיחה.
      const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
      const book = input.book
      if (!book) {
        return retry(state, 'ask_sku', skuBase, [
          m('sku_not_found'),
          m('sku_retry'),
        ], { max: 10, seconds: 10 }, false, messages)
      }
      if (!book.in_stock) {
        return retry(state, 'ask_sku', skuBase, [
          m('book_sold_out', { title: book.title }),
          m('ask_sku_other'),
        ], { max: 10, seconds: 10 }, false, messages)
      }
      return {
        state: { ...state, step: 'ask_qty', attempts: 0 },
        response: readTap('bf_qty', [
          t(ttsClean(book.title)),
          m('price_word'),
          n(agorotToSpokenShekels(book.price_agorot)),
          m('shekels_word'),
          m('ask_qty'),
        ], { max: 2, seconds: 8 }),
      }
    }

    case 'ask_qty': {
      const qty = Number(input.value)
      const book = input.book

      if (!book || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
        return retry(state, 'ask_qty', 'bf_qty', [
          m('qty_invalid', { max: MAX_QTY }),
        ], { max: 2, seconds: 8 }, false, messages)
      }

      // 🔴 השריון נכשל = אזל בזמן השיחה. חוזרים למק"ט, לא ממשיכים.
      if (input.reserved === false) {
        const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
        return retry(state, 'ask_sku', skuBase, [
          m('qty_unavailable'),
          m('ask_sku_other'),
        ], { max: 10, seconds: 10 }, false, messages)
      }

      const items = [...state.items, {
        book_id: book.id, sku: book.sku, title: book.title,
        price_agorot: book.price_agorot, quantity: qty,
      }]

      return {
        state: { ...state, step: 'ask_more', items, attempts: 0 },
        response: readTap('bf_more', [
          m('added_to_cart', { qty, title: book.title }),
          m('ask_more'),
        ], { max: 1, min: 1, seconds: 8 }),
      }
    }

    case 'ask_more': {
      if (input.value === '1') {
        // ⚠️ שם משתנה תלוי-כמות (bf_sku_next<n>): שונה בכל פעם שמוסיפים
        // ספר, כדי שה-read לא יתנגש עם אותה שאלה על ספר קודם באותה שיחה.
        const skuBase = `bf_sku_next${state.items.length}`
        return {
          state: { ...state, step: 'ask_sku', attempts: 0 },
          response: readTap(skuBase, [m('ask_next_sku')], { max: 10, seconds: 10 }),
        }
      }
      if (input.value === '2') {
        return askDelivery({ ...state, attempts: 0 }, messages)
      }
      return retry(state, 'ask_more', 'bf_more', [
        m('ask_more_retry'),
      ], { max: 1, seconds: 8 }, false, messages)
    }

    case 'ask_delivery': {
      if (input.value === '1') {
        return askName({ ...state, delivery: 'pickup', shipping_agorot: 0, attempts: 0 }, messages)
      }
      if (input.value === '2') {
        return {
          state: { ...state, delivery: 'shipping', step: 'ask_city', attempts: 0 },
          response: readTap('bf_city', [m('ask_city')], { max: 2, seconds: 10 }),
        }
      }
      return retry(state, 'ask_delivery', 'bf_deliv', [
        m('ask_delivery_retry'),
      ], { max: 1, seconds: 10 }, false, messages)
    }

    case 'ask_city': {
      const city = input.city
      if (!city) {
        return retry(state, 'ask_city', 'bf_city', [
          m('city_unknown'),
          m('city_list_only'),
        ], { max: 2, seconds: 10 }, false, messages)
      }

      const ship = input.shipping_agorot
      if (ship === null || ship === undefined) {
        return {
          state: { ...state, step: 'done' },
          response: `${idMessage(
            m('shipping_unavailable'),
            m('call_office'),
          )}&${hangup}`,
        }
      }

      return {
        state: { ...state, city_id: city.id, city_name: city.name, shipping_agorot: ship, step: 'record_address', attempts: 0 },
        response: readRecord('bf_addr', [
          m('shipping_to', { city: city.name }),
          m('ask_address'),
        ], 30),
      }
    }

    case 'record_address': {
      if (!input.recording) {
        return retry(state, 'record_address', 'bf_addr', [
          m('no_recording'),
        ], { max: '', seconds: 30 }, true, messages)
      }
      return askName({
        ...state,
        address_recording: input.recording,
        address_transcript: input.transcript,
        attempts: 0,
      }, messages)
    }

    case 'ask_name': {
      if (!input.recording) {
        return retry(state, 'ask_name', 'bf_name', [
          m('no_name_recording'),
        ], { max: '', seconds: 15 }, true, messages)
      }

      const items = totalOf(state.items)
      const ship = state.shipping_agorot ?? 0
      const total = items + ship

      return {
        state: {
          ...state,
          name_recording: input.recording,
          name_transcript: input.transcript,
          step: 'confirm_total',
          attempts: 0,
        },
        response: readTap('bf_conf', [
          m('total_books'), n(agorotToSpokenShekels(items)), m('for_books'),
          ...(ship > 0
            ? [m('plus_shipping'), n(agorotToSpokenShekels(ship)), m('shipping_fee_word')]
            : [m('no_shipping_fee')]),
          m('grand_total'), n(agorotToSpokenShekels(total)), m('shekels_word'),
          m('ask_pay'),
        ], { max: 1, seconds: 12 }),
      }
    }

    case 'confirm_total': {
      if (input.value === '2') {
        return {
          state: { ...state, step: 'done' },
          response: `${idMessage(m('cancelled'))}&${hangup}`,
        }
      }
      if (input.value !== '1') {
        return retry(state, 'confirm_total', 'bf_conf', [
          m('ask_pay_retry'),
        ], { max: 1, seconds: 10 }, false, messages)
      }
      return {
        state: { ...state, step: 'payment', attempts: 0 },
        // 🔴 מכאן הסליקה עצמה מתבצעת בתוך ימות (מודול credit_card) —
        // הפרמטרים המדויקים (מספר מוסד, קטגוריה, ApiValid) מוגדרים
        // בממשק ניהול השלוחה בימות, לא כאן. ה-route בונה את שורת
        // credit_card= בפועל (כולל billing_sum הדינמי) ומצרף אותה
        // לפני שהתשובה הזו נשלחת.
        response: '__CREDIT_CARD_PLACEHOLDER__',
      }
    }

    case 'payment': {
      if (input.payment === 'success') {
        const num = input.order_number ?? state.order_number ?? ''
        return {
          state: { ...state, step: 'done', order_number: num },
          response: `${idMessage(
            m('paid_ok'),
            m('order_number'),
            d(num.replace(/[^0-9A-Z]/g, '')),
            m('goodbye'),
          )}&${hangup}`,
        }
      }
      return {
        state: { ...state, step: 'done' },
        response: `${idMessage(
          m('paid_fail'),
          m('paid_fail_retry'),
        )}&${hangup}`,
      }
    }

    case 'done':
    default:
      return { state: { ...state, step: 'done' }, response: hangup }
  }
}

// ── עזרים ────────────────────────────────────────────────────────────────────

function askDelivery(state: IvrState, messages?: IvrMessages): IvrTurn {
  return {
    state: { ...state, step: 'ask_delivery' },
    response: readTap('bf_deliv', [
      msgToken(messages, 'ask_delivery'),
    ], { max: 1, seconds: 10 }),
  }
}

function askName(state: IvrState, messages?: IvrMessages): IvrTurn {
  return {
    state: { ...state, step: 'ask_name' },
    response: readRecord('bf_name', [msgToken(messages, 'ask_name')], 15),
  }
}

/**
 * שם המשתנה בפועל לניסיון נתון: הבסיס בניסיון הראשון, ואז `_r<n>`.
 *
 * ⚠️ מיוצא כדי שה-route ידע לחפש את כל הווריאציות האפשריות בפרמטרים
 * שחוזרים מימות — היא אינה יודעת משלב קודם איזה שם בדיוק ישמש.
 */
export function attemptVarName(base: string, attempts: number): string {
  return attempts <= 0 ? base : `${base}_r${attempts}`
}

/**
 * חזרה על שלב אחרי קלט שגוי.
 *
 * 🔴 אחרי MAX_ATTEMPTS — ניתוק מנומס ולא לולאה.
 * ⚠️ שם המשתנה מקבל סיומת לפי מספר הניסיון (attemptVarName) — קריאה
 * חוזרת של משתנה שכבר מלא יוצרת לולאה אינסופית בימות. זו אותה מלכודת
 * שתועדה בכל שלוחות ימות הקיימות בפרויקט (yemot-holiday וכו').
 */
function retry(
  state: IvrState, step: IvrStep, varBase: string, tokens: string[],
  opts: ReadOpts, isRecord = false, messages?: IvrMessages,
): IvrTurn {
  const attempts = state.attempts + 1

  if (attempts >= MAX_ATTEMPTS) {
    return {
      state: { ...state, step: 'done' },
      response: `${idMessage(
        msgToken(messages, 'input_error'),
        msgToken(messages, 'call_office'),
      )}&${hangup}`,
    }
  }

  const varName = attemptVarName(varBase, attempts)
  return {
    state: { ...state, step, attempts },
    response: isRecord ? readRecord(varName, tokens, Number(opts.seconds ?? 30)) : readTap(varName, tokens, opts),
  }
}
