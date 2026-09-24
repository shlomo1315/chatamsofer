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

// ── מכונת המצבים ─────────────────────────────────────────────────────────────

/**
 * הצעד הבא בשיחה.
 *
 * 🔴 טהורה: אותו (state, input) יחזיר תמיד אותה תוצאה. כל פעולה שדורשת
 * מסד — חיפוש ספר, שריון, יצירת הזמנה — נעשית בשכבה שמעל (ה-route)
 * ומוזנת פנימה דרך `input`.
 */
export function nextTurn(state: IvrState, input: IvrInput = {}): IvrTurn {
  switch (state.step) {

    case 'welcome':
      return {
        state: { ...state, step: 'ask_sku', attempts: 0 },
        response: readTap('bf_sku', [
          t('ברוכים הבאים ליריד הספרים של היכל החתם סופר'),
          t('להזמנת ספר הקישו את מספר הקטלוג ולאחריו סולמית'),
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
          t('מספר הקטלוג שהקשתם לא נמצא'),
          t('נסו שוב או המתינו לנציג'),
        ], { max: 10, seconds: 10 })
      }
      if (!book.in_stock) {
        return retry(state, 'ask_sku', skuBase, [
          t(`הספר ${ttsClean(book.title)} אזל מהמלאי בקו הטלפוני`),
          t('הקישו מספר קטלוג אחר'),
        ], { max: 10, seconds: 10 })
      }
      return {
        state: { ...state, step: 'ask_qty', attempts: 0 },
        response: readTap('bf_qty', [
          t(ttsClean(book.title)),
          t('מחיר'),
          n(agorotToSpokenShekels(book.price_agorot)),
          t('שקלים'),
          t('כמה עותקים הקישו מספר ולאחריו סולמית'),
        ], { max: 2, seconds: 8 }),
      }
    }

    case 'ask_qty': {
      const qty = Number(input.value)
      const book = input.book

      if (!book || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
        return retry(state, 'ask_qty', 'bf_qty', [
          t(`הקישו מספר בין אחד ל${MAX_QTY}`),
        ], { max: 2, seconds: 8 })
      }

      // 🔴 השריון נכשל = אזל בזמן השיחה. חוזרים למק"ט, לא ממשיכים.
      if (input.reserved === false) {
        const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
        return retry(state, 'ask_sku', skuBase, [
          t('מצטערים הכמות המבוקשת אינה זמינה'),
          t('הקישו מספר קטלוג אחר'),
        ], { max: 10, seconds: 10 })
      }

      const items = [...state.items, {
        book_id: book.id, sku: book.sku, title: book.title,
        price_agorot: book.price_agorot, quantity: qty,
      }]

      return {
        state: { ...state, step: 'ask_more', items, attempts: 0 },
        response: readTap('bf_more', [
          t('נוספו לסל'), n(qty), t(`עותקים של ${ttsClean(book.title)}`),
          t('להוספת ספר נוסף הקישו אחת לסיום ההזמנה הקישו שתיים'),
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
          response: readTap(skuBase, [t('הקישו את מספר הקטלוג של הספר הבא')], { max: 10, seconds: 10 }),
        }
      }
      if (input.value === '2') {
        return askDelivery({ ...state, attempts: 0 })
      }
      return retry(state, 'ask_more', 'bf_more', [
        t('הקישו אחת להוספת ספר או שתיים לסיום'),
      ], { max: 1, seconds: 8 })
    }

    case 'ask_delivery': {
      if (input.value === '1') {
        return askName({ ...state, delivery: 'pickup', shipping_agorot: 0, attempts: 0 })
      }
      if (input.value === '2') {
        return {
          state: { ...state, delivery: 'shipping', step: 'ask_city', attempts: 0 },
          response: readTap('bf_city', [t('הקישו את קוד העיר שאליה יישלחו הספרים')], { max: 2, seconds: 10 }),
        }
      }
      return retry(state, 'ask_delivery', 'bf_deliv', [
        t('הקישו אחת לאיסוף עצמי או שתיים למשלוח'),
      ], { max: 1, seconds: 10 })
    }

    case 'ask_city': {
      const city = input.city
      if (!city) {
        return retry(state, 'ask_city', 'bf_city', [
          t('קוד העיר שהקשתם אינו מוכר'),
          t('משלוחים מתבצעים לערים שבמוקד בלבד הקישו קוד עיר אחר'),
        ], { max: 2, seconds: 10 })
      }

      const ship = input.shipping_agorot
      if (ship === null || ship === undefined) {
        return {
          state: { ...state, step: 'done' },
          response: `${idMessage(
            t('לא ניתן לחשב את דמי המשלוח להזמנה זו'),
            t('אנא התקשרו למשרד להשלמת ההזמנה'),
          )}&${hangup}`,
        }
      }

      return {
        state: { ...state, city_id: city.id, city_name: city.name, shipping_agorot: ship, step: 'record_address', attempts: 0 },
        response: readRecord('bf_addr', [
          t(`משלוח ל${ttsClean(city.name)}`),
          t('אמרו את הרחוב מספר הבית ומספר הדירה ולאחר מכן הקישו סולמית'),
        ], 30),
      }
    }

    case 'record_address': {
      if (!input.recording) {
        return retry(state, 'record_address', 'bf_addr', [
          t('לא נקלטה הקלטה נסו שוב'),
        ], { max: '', seconds: 30 }, true)
      }
      return askName({
        ...state,
        address_recording: input.recording,
        address_transcript: input.transcript,
        attempts: 0,
      })
    }

    case 'ask_name': {
      if (!input.recording) {
        return retry(state, 'ask_name', 'bf_name', [
          t('לא נקלטה הקלטה אמרו את שמכם המלא'),
        ], { max: '', seconds: 15 }, true)
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
          t('סך ההזמנה'), n(agorotToSpokenShekels(items)), t('שקלים עבור הספרים'),
          ...(ship > 0 ? [t('ועוד'), n(agorotToSpokenShekels(ship)), t('שקלים דמי משלוח')] : [t('ללא דמי משלוח')]),
          t('סך הכל לתשלום'), n(agorotToSpokenShekels(total)), t('שקלים'),
          t('לתשלום בכרטיס אשראי הקישו אחת לביטול ההזמנה הקישו שתיים'),
        ], { max: 1, seconds: 12 }),
      }
    }

    case 'confirm_total': {
      if (input.value === '2') {
        return {
          state: { ...state, step: 'done' },
          response: `${idMessage(t('ההזמנה בוטלה תודה ולהתראות'))}&${hangup}`,
        }
      }
      if (input.value !== '1') {
        return retry(state, 'confirm_total', 'bf_conf', [
          t('הקישו אחת לתשלום או שתיים לביטול'),
        ], { max: 1, seconds: 10 })
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
            t('התשלום התקבל בהצלחה'),
            t('מספר ההזמנה שלכם'),
            d(num.replace(/[^0-9A-Z]/g, '')),
            t('תודה ויום טוב'),
          )}&${hangup}`,
        }
      }
      return {
        state: { ...state, step: 'done' },
        response: `${idMessage(
          t('התשלום לא אושר'),
          t('ההזמנה לא נקלטה ניתן לנסות שוב או לפנות למשרד'),
        )}&${hangup}`,
      }
    }

    case 'done':
    default:
      return { state: { ...state, step: 'done' }, response: hangup }
  }
}

// ── עזרים ────────────────────────────────────────────────────────────────────

function askDelivery(state: IvrState): IvrTurn {
  return {
    state: { ...state, step: 'ask_delivery' },
    response: readTap('bf_deliv', [
      t('לאיסוף עצמי מהיריד הקישו אחת למשלוח עד הבית הקישו שתיים'),
    ], { max: 1, seconds: 10 }),
  }
}

function askName(state: IvrState): IvrTurn {
  return {
    state: { ...state, step: 'ask_name' },
    response: readRecord('bf_name', [t('אמרו את שמכם המלא ולאחר מכן הקישו סולמית')], 15),
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
  opts: ReadOpts, isRecord = false,
): IvrTurn {
  const attempts = state.attempts + 1

  if (attempts >= MAX_ATTEMPTS) {
    return {
      state: { ...state, step: 'done' },
      response: `${idMessage(
        t('לא הצלחנו לקלוט את הבחירה'),
        t('אנא התקשרו למשרד תודה'),
      )}&${hangup}`,
    }
  }

  const varName = attemptVarName(varBase, attempts)
  return {
    state: { ...state, step, attempts },
    response: isRecord ? readRecord(varName, tokens, Number(opts.seconds ?? 30)) : readTap(varName, tokens, opts),
  }
}
