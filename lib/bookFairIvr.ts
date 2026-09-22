// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — מכונת המצבים של השיחה הטלפונית (מרכזיית טכנוליין).
//
// 🔴 הקובץ טהור לחלוטין: בלי רשת, בלי מסד, בלי תאריכים. הוא מקבל מצב
// וקלט, ומחזיר מצב חדש ותשובת JSON למרכזייה.
//
// זו הסיבה שאפשר לבדוק כאן *מה המתקשר שומע* — הדבר היחיד שבאמת חשוב,
// ושאי אפשר לראות בשום לוג אחרי שהוא ניתק.
//
// ⚠️ המלכודת המרכזית בטכנוליין: JSON לא תקין או `type` שאינו מוכר
// מחזיר את המתקשר לתפריט הקודם **בשקט**. אין שגיאה, אין חיווי — מבחינתו
// "התפריט חוזר על עצמו". לכן כל מסלול כאן חייב להחזיר מודול תקין.
// ─────────────────────────────────────────────────────────────────────────────

import { agorotToSpokenShekels } from './bookFairPricing'

// ── תשובות המרכזייה ──────────────────────────────────────────────────────────

/** פריט במערך files — מה שהמתקשר שומע. */
export type IvrFile =
  | { text: string }        // הקראה (TTS)
  | { fileName: string }    // קובץ שמע שהועלה מראש
  | { number: string }      // מספר שלם: "120" → "מאה עשרים"
  | { digits: string }      // ספרה-ספרה: "120" → "אחת שתיים אפס"

export type IvrResponse =
  | { type: 'simpleMessage'; files: IvrFile[] }
  | { type: 'getDTMF'; name: string; files: IvrFile[]; max: number; min?: number; timeout?: number; maskLog?: boolean }
  | { type: 'simpleMenu'; files: IvrFile[]; enabledKeys: string; timeout?: number }
  | { type: 'record'; name: string; files: IvrFile[]; max?: number; confirm?: string; sttSoft?: boolean; sttMode?: string; sttCities?: string }
  | { type: 'stt'; name: string; files: IvrFile[]; sttMode?: string; sttCities?: string; sttStrict?: boolean }
  | { type: 'creditCard'; name: string; sum: number; cvv?: string; tz?: string; maskLog?: boolean }
  | { type: 'hangup' }

// ── מצב השיחה ────────────────────────────────────────────────────────────────

export type IvrStep =
  | 'welcome'        // פתיחה
  | 'ask_sku'        // הקשת מק"ט
  | 'ask_qty'        // כמה עותקים
  | 'ask_more'       // עוד ספר?
  | 'ask_delivery'   // איסוף או משלוח
  | 'ask_city'       // קוד עיר
  | 'record_address' // הקלטת כתובת
  | 'ask_name'       // הקלטת שם
  | 'confirm_total'  // אישור הסכום
  | 'payment'        // סליקה
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
  /** מזהה ההקלטה אצל הספק — הכתובת מוקלדת מההקלטה במשרד. */
  address_recording?: string
  address_transcript?: string
  name_recording?: string
  name_transcript?: string
  shipping_agorot?: number
  order_id?: string
  order_number?: string
  /** מספר הניסיונות בשלב הנוכחי — לניתוק אחרי כשלים חוזרים. */
  attempts: number
}

export function initialState(): IvrState {
  return { step: 'welcome', items: [], attempts: 0 }
}

// ── קלט ──────────────────────────────────────────────────────────────────────

export interface IvrInput {
  /** מה שהוקש/הוקלט בשלב הקודם. */
  value?: string
  /** תוצאת חיפוש ספר לפי מק"ט — נעשית בשכבה שמעל, לא כאן. */
  book?: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean } | null
  /** תוצאת בחירת עיר. */
  city?: { id: string; name: string } | null
  /** מחיר המשלוח שחושב בשכבה שמעל. */
  shipping_agorot?: number | null
  /** האם השריון הצליח. */
  reserved?: boolean
  /** מזהה ההקלטה שחזר מהמרכזייה. */
  recording?: string
  transcript?: string
  /** תוצאת הסליקה. */
  payment?: 'success' | 'failed'
  order_number?: string
}

export interface IvrTurn {
  state: IvrState
  response: IvrResponse
}

// ── קבועים ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ שלושה ניסיונות ואז ניתוק מנומס. בלי תקרה, מתקשר שמקיש שגוי שוב
 * ושוב נתקע בלולאה — וזה נראה לו בדיוק כמו תקלה במערכת.
 */
const MAX_ATTEMPTS = 3

const MAX_QTY = 20

// ── הודעות ───────────────────────────────────────────────────────────────────

const say = (text: string): IvrFile => ({ text })

/**
 * ⚠️ ניקוי טקסט להקראה. מרכזיות מתקשות על תווים מסוימים, וגרש בתוך שם
 * ספר ("שו״ת") עלול לשבש את ההקראה כולה.
 */
export function ttsClean(text: string): string {
  return String(text ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')      // תווי כיווניות בלתי נראים
    .replace(/["'״׳`|&]/g, ' ')        // גרשיים ותווים בעייתיים
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const totalOf = (items: IvrCartItem[]) =>
  items.reduce((s, i) => s + i.price_agorot * i.quantity, 0)


// ── מכונת המצבים ─────────────────────────────────────────────────────────────

/**
 * הצעד הבא בשיחה.
 *
 * 🔴 טהורה: אותו (state, input) יחזיר תמיד אותה תוצאה. כל פעולה שדורשת
 * מסד — חיפוש ספר, שריון, יצירת הזמנה — נעשית בשכבה שמעל ומוזנת פנימה
 * דרך `input`.
 */
export function nextTurn(state: IvrState, input: IvrInput = {}): IvrTurn {
  switch (state.step) {

    // ── פתיחה ──
    case 'welcome':
      return {
        state: { ...state, step: 'ask_sku', attempts: 0 },
        response: {
          type: 'getDTMF',
          name: 'bf_sku',
          max: 10,
          min: 1,
          timeout: 10,
          files: [
            say('ברוכים הבאים ליריד הספרים של היכל החתם סופר'),
            say('להזמנת ספר, הקישו את מספר הקטלוג ולאחריו סולמית'),
          ],
        },
      }

    // ── הקשת מק"ט ──
    case 'ask_sku': {
      const book = input.book
      if (!book) {
        // ⚠️ משתנה חדש לכל ניסיון: קריאה חוזרת של משתנה שכבר מלא
        // יוצרת לולאה אינסופית במרכזייה.
        return retry(state, 'ask_sku', `bf_sku`, [
          say('מספר הקטלוג שהקשתם לא נמצא'),
          say('נסו שוב, או המתינו לנציג'),
        ], 10)
      }
      if (!book.in_stock) {
        return retry(state, 'ask_sku', 'bf_sku', [
          say(`הספר ${ttsClean(book.title)} אזל מהמלאי בקו הטלפוני`),
          say('הקישו מספר קטלוג אחר'),
        ], 10)
      }

      return {
        state: { ...state, step: 'ask_qty', attempts: 0 },
        response: {
          type: 'getDTMF',
          name: 'bf_qty',
          max: 2,
          min: 1,
          timeout: 8,
          files: [
            say(ttsClean(book.title)),
            say('מחיר'),
            { number: agorotToSpokenShekels(book.price_agorot) },
            say('שקלים'),
            say('כמה עותקים? הקישו מספר ולאחריו סולמית'),
          ],
        },
      }
    }

    // ── כמות ──
    case 'ask_qty': {
      const qty = Number(input.value)
      const book = input.book

      if (!book || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
        return retry(state, 'ask_qty', 'bf_qty', [
          say(`הקישו מספר בין אחד ל${MAX_QTY}`),
        ], 2)
      }

      // 🔴 השריון נכשל = אזל בזמן השיחה. חוזרים למק"ט, לא ממשיכים.
      if (input.reserved === false) {
        return retry(state, 'ask_sku', 'bf_sku', [
          say('מצטערים, הכמות המבוקשת אינה זמינה'),
          say('הקישו מספר קטלוג אחר'),
        ], 10)
      }

      const items = [...state.items, {
        book_id: book.id, sku: book.sku, title: book.title,
        price_agorot: book.price_agorot, quantity: qty,
      }]

      return {
        state: { ...state, step: 'ask_more', items, attempts: 0 },
        response: {
          type: 'simpleMenu',
          enabledKeys: '12',
          timeout: 8,
          files: [
            say('נוספו לסל'),
            { number: String(qty) },
            say(`עותקים של ${ttsClean(book.title)}`),
            say('להוספת ספר נוסף הקישו אחת'),
            say('לסיום ההזמנה הקישו שתיים'),
          ],
        },
      }
    }

    // ── עוד ספר? ──
    case 'ask_more': {
      if (input.value === '1') {
        return {
          state: { ...state, step: 'ask_sku', attempts: 0 },
          response: {
            type: 'getDTMF', name: 'bf_sku2', max: 10, min: 1, timeout: 10,
            files: [say('הקישו את מספר הקטלוג של הספר הבא')],
          },
        }
      }
      if (input.value === '2') {
        return askDelivery({ ...state, attempts: 0 })
      }
      return retry(state, 'ask_more', 'bf_more', [
        say('הקישו אחת להוספת ספר, או שתיים לסיום'),
      ], 1)
    }

    // ── איסוף או משלוח ──
    case 'ask_delivery': {
      if (input.value === '1') {
        // איסוף עצמי — אין צורך בעיר ובכתובת
        return askName({ ...state, delivery: 'pickup', shipping_agorot: 0, attempts: 0 })
      }
      if (input.value === '2') {
        return {
          state: { ...state, delivery: 'shipping', step: 'ask_city', attempts: 0 },
          response: {
            type: 'getDTMF', name: 'bf_city', max: 2, min: 1, timeout: 10,
            files: [say('הקישו את קוד העיר שאליה יישלחו הספרים')],
          },
        }
      }
      return retry(state, 'ask_delivery', 'bf_deliv', [
        say('הקישו אחת לאיסוף עצמי, או שתיים למשלוח'),
      ], 1)
    }

    // ── עיר ──
    case 'ask_city': {
      const city = input.city
      if (!city) {
        return retry(state, 'ask_city', 'bf_city', [
          say('קוד העיר שהקשתם אינו מוכר'),
          say('משלוחים מתבצעים לערים שבמוקד בלבד'),
          say('הקישו קוד עיר אחר'),
        ], 2)
      }

      const ship = input.shipping_agorot
      // 🔴 null = אין מדרגת תעריף. לא ממשיכים בחינם — מפנים לנציג.
      if (ship === null || ship === undefined) {
        return {
          state: { ...state, step: 'done' },
          response: {
            type: 'simpleMessage',
            files: [
              say('לא ניתן לחשב את דמי המשלוח להזמנה זו'),
              say('אנא התקשרו למשרד להשלמת ההזמנה'),
            ],
          },
        }
      }

      return {
        state: { ...state, city_id: city.id, city_name: city.name, shipping_agorot: ship, step: 'record_address', attempts: 0 },
        response: {
          // 🔴 הקלטה + תמלול רקע: התמלול הוא הצעה למשרד, והאישור מול
          // הלקוח מתבצע על ההקלטה של קולו שלו. תמלול עברית על קו טלפון
          // שגוי לעיתים קרובות מכדי לסמוך עליו לכתובת משלוח.
          type: 'record',
          name: 'bf_addr',
          max: 30,
          confirm: 'confirmOnly',
          sttSoft: true,
          sttMode: 'streets',
          // ⚠️ מוגבל לרחובות העיר שנבחרה — ירושלים לבדה היא כ-4,380
          // רחובות, והתקרה היא 5,000. עיר אחת בכל פעם.
          sttCities: city.name,
          files: [
            say(`משלוח ל${ttsClean(city.name)}`),
            say('אמרו את הרחוב, מספר הבית ומספר הדירה, ולאחר מכן הקישו סולמית'),
          ],
        },
      }
    }

    // ── הקלטת כתובת ──
    case 'record_address': {
      if (!input.recording) {
        return retry(state, 'record_address', 'bf_addr', [
          say('לא נקלטה הקלטה. נסו שוב'),
        ], 30)
      }
      return askName({
        ...state,
        address_recording: input.recording,
        address_transcript: input.transcript,
        attempts: 0,
      })
    }

    // ── הקלטת שם ──
    case 'ask_name': {
      if (!input.recording) {
        return retry(state, 'ask_name', 'bf_name', [
          say('לא נקלטה הקלטה. אמרו את שמכם המלא'),
        ], 15)
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
        response: {
          type: 'simpleMenu',
          enabledKeys: '12',
          timeout: 12,
          files: [
            say('סך ההזמנה'),
            { number: agorotToSpokenShekels(items) },
            say('שקלים עבור הספרים'),
            ...(ship > 0
              ? [say('ועוד'), { number: agorotToSpokenShekels(ship) } as IvrFile, say('שקלים דמי משלוח')]
              : [say('ללא דמי משלוח')]),
            say('סך הכול לתשלום'),
            { number: agorotToSpokenShekels(total) },
            say('שקלים'),
            say('לתשלום בכרטיס אשראי הקישו אחת'),
            say('לביטול ההזמנה הקישו שתיים'),
          ],
        },
      }
    }

    // ── אישור הסכום ──
    case 'confirm_total': {
      if (input.value === '2') {
        return {
          state: { ...state, step: 'done' },
          response: {
            type: 'simpleMessage',
            files: [say('ההזמנה בוטלה. תודה ולהתראות')],
          },
        }
      }
      if (input.value !== '1') {
        return retry(state, 'confirm_total', 'bf_conf', [
          say('הקישו אחת לתשלום, או שתיים לביטול'),
        ], 1)
      }

      const total = totalOf(state.items) + (state.shipping_agorot ?? 0)
      return {
        state: { ...state, step: 'payment', attempts: 0 },
        response: {
          // 🔴 מודול הסליקה של המרכזייה: פרטי הכרטיס לעולם אינם עוברים
          // דרך השרת שלנו. maskLog מונע כתיבת הערכים ללוגים.
          type: 'creditCard',
          name: 'bf_pay',
          sum: Math.ceil(total / 100),
          cvv: 'yes',
          tz: 'no',
          maskLog: true,
        },
      }
    }

    // ── תוצאת הסליקה ──
    case 'payment': {
      if (input.payment === 'success') {
        const num = input.order_number ?? state.order_number ?? ''
        return {
          state: { ...state, step: 'done', order_number: num },
          response: {
            type: 'simpleMessage',
            files: [
              say('התשלום התקבל בהצלחה'),
              say('מספר ההזמנה שלכם'),
              // ⚠️ ספרה-ספרה ולא כמספר: מספר הזמנה מוקלד חזרה, והקראה
              // כמספר שלם הופכת אותו לבלתי ניתן לרישום.
              { digits: num.replace(/[^0-9A-Z]/g, '') },
              say('מספר ההזמנה יישלח אליכם גם במסרון'),
              say('תודה ויום טוב'),
            ],
          },
        }
      }

      return {
        state: { ...state, step: 'done' },
        response: {
          type: 'simpleMessage',
          files: [
            say('התשלום לא אושר'),
            say('ההזמנה לא נקלטה. ניתן לנסות שוב או לפנות למשרד'),
          ],
        },
      }
    }

    case 'done':
    default:
      return { state: { ...state, step: 'done' }, response: { type: 'hangup' } }
  }
}

// ── עזרים ────────────────────────────────────────────────────────────────────

function askDelivery(state: IvrState): IvrTurn {
  return {
    state: { ...state, step: 'ask_delivery' },
    response: {
      type: 'simpleMenu',
      enabledKeys: '12',
      timeout: 10,
      files: [
        say('לאיסוף עצמי מהיריד הקישו אחת'),
        say('למשלוח עד הבית הקישו שתיים'),
      ],
    },
  }
}

function askName(state: IvrState): IvrTurn {
  return {
    state: { ...state, step: 'ask_name' },
    response: {
      type: 'record',
      name: 'bf_name',
      max: 15,
      confirm: 'confirmOnly',
      sttSoft: true,
      files: [say('אמרו את שמכם המלא, ולאחר מכן הקישו סולמית')],
    },
  }
}

/**
 * חזרה על שלב אחרי קלט שגוי.
 *
 * 🔴 אחרי MAX_ATTEMPTS — ניתוק מנומס ולא לולאה. מתקשר שתקוע בלולאה
 * חווה את זה בדיוק כמו תקלה במערכת.
 *
 * ⚠️ שם המשתנה מקבל סיומת לפי מספר הניסיון: קריאה חוזרת של משתנה
 * שכבר מלא יוצרת לולאה אינסופית במרכזייה.
 */
function retry(state: IvrState, step: IvrStep, varName: string, files: IvrFile[], max: number): IvrTurn {
  const attempts = state.attempts + 1

  if (attempts >= MAX_ATTEMPTS) {
    return {
      state: { ...state, step: 'done' },
      response: {
        type: 'simpleMessage',
        files: [
          say('לא הצלחנו לקלוט את הבחירה'),
          say('אנא התקשרו למשרד. תודה'),
        ],
      },
    }
  }

  const name = `${varName}_r${attempts}`
  const isMenu = max === 1

  return {
    state: { ...state, step, attempts },
    response: isMenu
      ? { type: 'simpleMenu', enabledKeys: '12', timeout: 10, files }
      : step === 'record_address' || step === 'ask_name'
        ? { type: 'record', name, max, confirm: 'confirmOnly', sttSoft: true, files }
        : { type: 'getDTMF', name, max, min: 1, timeout: 10, files },
  }
}
