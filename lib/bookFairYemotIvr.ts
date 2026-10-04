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
  /**
   * המקשים המותרים בתפריט, למשל ['1','2','3'].
   *
   * 🔴 חובה בכל תפריט בחירה: בלעדיו ימות מקבלת כל הקשה ושולחת אותה
   * אלינו, כולל מקשים שאין להם משמעות בשלב הזה.
   */
  keys?: string[]
}

// 🔴 בלי סינון קבצים ובלי תקרה — בדיוק כמו בחגים וביולדות
// שעובדות. הניסיונות להגביל (4→2→0) לא פתרו דבר, והוסיפו דרך
// שבה הודעה יכלה להיעלם בשקט.
//
// הקול הטבעי הוא הדרישה; הטוקנים נשלחים כמות שהם.

function readTap(varName: string, promptTokens: string[], opts: ReadOpts = {}): string {
  const { max = '', min = 1, seconds = 12, keys } = opts
  // read=<הודעה>=<שם>,<שימוש בקיים>,<max>,<min>,<שניות>,<אופן הקראה>,...
  //
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 בדיוק המבנה שעבד — אל תשנו אותו בלי שיחת בדיקה.
  //
  // הלוגים מ-10:05 מראים שיחות תקינות לחלוטין עם:
  //   read=t-...=bf_omenu,yes,1,1,10,Digits,,,,,,,
  // כלומר **13 שדות** ו-**Digits**.
  //
  // ⚠️ שיניתי את שניהם בניסיון לתקן את "שגיאה" — ל-14 שדות
  // ול-'No','no','no' לפי הדפוס של חגים/יולדות — וזה בדיוק מה
  // ש*שבר* את השלוחה. הדפוס של שלוחה אחרת אינו ראיה לשלוחה הזו.
  //
  // ⚠️ המחיר של Digits: ימות מקריאה את ההקשה חזרה ("1, לאישור
  // הקישו 1"). מטריד, אבל עדיף פי כמה על ניתוק — וזה היה המצב
  // כשהמערכת עבדה.
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 14 שדות ו-'No','no','no' — בדיוק כמו בחגים וביולדות שעובדות.
  //
  // ⚠️ זה כבר נוסה פעם אחת ונכשל, ולכן הוחזר ל-13 שדות. אבל הניסוי
  // ההוא רץ כשכל ההקלטות היו קבצי PCM פגומים: *כל* שיחה עם f- נפלה
  // אז, בכל מבנה שהוא, ולכן הוא לא יכול היה להעיד על מספר השדות.
  //
  // העדות שמחייבת לנסות שוב: ב-16:05 הקבצים כבר היו MP3 תקינים
  // (tts_welcome_muu0esa7) והשיחה עדיין נותקה מיד. הפורמט תוקן —
  // ומה שנותר שונה מהחגים הוא בדיוק המבנה הזה.
  // ─────────────────────────────────────────────────────────────────────────
  const ops = [
    varName, 'yes',
    max === '' ? '' : String(max), String(min), String(seconds),
    'No', 'no', 'no', '',
    (keys ?? []).join('.'),
    '', '', '', '',
  ]
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
  // ── תפריטים ──
  | 'main_menu'        // 1 הזמנה · 2 הזמנה קיימת · 3 פנייה
  | 'order_menu'       // 1 מק"ט · 2 קטגוריות · 3 כל הספרים
  | 'category_menu'    // בחירת קטגוריה
  | 'browse'           // דפדוף ברשימת ספרים (קטגוריה או הכול)
  // ── בחירת ספר ──
  | 'ask_sku'
  | 'confirm_book'     // "בחרתם X המחיר Y" → 1 אישור · 2 תיקון
  | 'ask_qty'
  | 'ask_more'
  // ── אספקה ותשלום ──
  | 'ask_delivery'
  | 'ask_city'
  | 'record_address'
  | 'ask_name'
  | 'confirm_total'
  | 'payment'
  // ── שלוחות 2 ו-3 ──
  | 'my_orders'
  | 'record_inquiry'
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

  // ── דפדוף ברשימת ספרים ──
  /** הקטגוריה שנבחרה. null = דפדוף בכל הקטלוג. */
  browse_category?: string | null
  /** המיקום ברשימה. ⚠️ אינדקס ולא מזהה: הרשימה נבנית מחדש בכל בקשה
   *  (ימות אינה שומרת מצב), והאינדקס הוא מה שמאפשר להמשיך מאותו מקום. */
  browse_index?: number
  /** הספר שהוצע אחרון וממתין לאישור — כדי ש"1" יאשר אותו בלי חיפוש חוזר. */
  pending_book_id?: string

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
  book?: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean; audio_name?: string | null } | null
  city?: { id: string; name: string } | null
  shipping_agorot?: number | null
  reserved?: boolean
  recording?: string
  transcript?: string
  /** תוצאת הסליקה — מגיעה מ-CreditCard_CODE בבקשה החוזרת מימות. */
  payment?: 'success' | 'failed'
  order_number?: string

  // ── נתונים שה-route שולף עבור המצבים החדשים ──
  /** הקלטות הקטגוריות: שם קטגוריה → שם קובץ. גובר על TTS. */
  categoryAudio?: Record<string, string>
  /** שמות הקטגוריות לפי סדר הקטלוג. */
  categories?: string[]
  /** הספרים ברשימה הנוכחית (קטגוריה או כל הקטלוג). */
  browseBooks?: { id: string; sku: string; title: string; price_agorot: number; in_stock: boolean; audio_name?: string | null }[]
  /** ההזמנות של המתקשר, לשלוחה 2. */
  myOrders?: { order_number: string; total_agorot: number; status: string }[]
  /** האם הפנייה נשמרה — לשלוחה 3. */
  inquirySaved?: boolean
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

  // 🔴 מתג כיבוי חירום — כבוי כברירת מחדל.
  //
  // כשהשלוחה ענתה "שגיאה" וניתקה, חשדנו שקבצי ההקלטה חסרים וכיבינו
  // אותם. ⚠️ החשד היה **שגוי**: בדיקה מול ימות
  // (/api/webhooks/yemot-book-fair/audio-check) הראתה שכל 16 הקבצים
  // יושבים בשלוחה 9, ואפס חסרים. הגורם האמיתי היה פקודת read עם 13
  // שדות במקום 14.
  //
  // ⚠️ ימות *מדלגת בשקט* על f- שהקובץ שלו חסר (ראו lib/ivrRuntime),
  // ולכן קובץ חסר לעולם אינו הגורם ל"שגיאה" — הוא גורם לשתיקה.
  //
  // המתג נשאר לשעת חירום: YEMOT_BOOK_FAIR_TEXT_ONLY=1 מחזיר את כל
  // השלוחה ל-TTS בלי פריסת קוד.
  if (process.env.YEMOT_BOOK_FAIR_TEXT_ONLY === '1') {
    let only = raw
    if (vars) {
      for (const [k, v] of Object.entries(vars)) only = only.split(`{${k}}`).join(String(v))
    }
    return t(only.replace(/\{[^}]*\}/g, ' '))
  }

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
  welcome: 'שלום וברכה הגעתם למערכת הזמנת ספרי החתם סופר שעל ידי ממלכת היכל החתם סופר',
  open_until: 'המערכת פתוחה להזמנות עד יום שלישי כ"ה בתשרי בשעה עשר בלילה',
  to_menu: 'הינכם מועברים לתפריט בכל שלב ניתן לעבור לתפריט הראשי על ידי הקשה על סולמית',
  main_menu: 'להזמנה חדשה הקישו 1 לשמיעת פרטי הזמנה קיימת הקישו 2 להשארת פנייה לשירות לקוחות הקישו 3',
  main_menu_retry: 'הקשה שגויה',
  order_menu: 'לזיהוי ספר לפי מספר קטלוג הקישו 1 לשמיעת שמות הספרים לפי קטגוריה הקישו 2 לשמיעת כל הספרים ברצף הקישו 3',
  ask_sku: 'הקישו את מספר הקטלוג של הספר המבוקש ולאחריו סולמית',
  closed: 'היריד סגור כרגע להזמנות',
  category_menu: 'לשמיעת הספרים בקטגוריה הקישו את מספרה',
  category_item: 'ל{name} הקישו {code}',
  category_empty: 'אין כרגע ספרים בקטגוריה זו',
  list_nav: 'לבחירת ספר זה הקישו 1 לחזרה לספר הקודם הקישו 2 לחזרה לרשימת הקטגוריות הקישו 3',
  list_all_nav: 'לבחירת ספר זה הקישו 1 לחזרה לספר הקודם הקישו 2 לחזרה לתפריט הקישו 3',
  list_end: 'הגעתם לסוף הרשימה',
  list_start: 'זהו הספר הראשון ברשימה',
  book_chosen: 'בחרתם {title} המחיר הוא {price} שקלים',
  // ⚠️ שני אלה משמשים רק כשלספר יש הקלטה משלו — ההודעה מתפצלת
  // סביבה: 'בחרתם' → הקלטת השם → 'המחיר הוא X שקלים'.
  book_chosen_prefix: 'בחרתם',
  book_chosen_price: 'המחיר הוא {price} שקלים',
  confirm_book: 'לאישור הקישו 1 לתיקון הקישו 2',
  book_saved: 'הספר נשמר בהצלחה',
  after_save: 'להזמנת ספר נוסף הקישו 1 למעבר לתשלום הקישו 2',
  sku_not_found: 'מספר הקטלוג שהקשתם לא נמצא',
  sku_retry: 'נסו שוב או המתינו לנציג',
  book_sold_out: 'הספר {title} אזל מהמלאי',
  ask_sku_other: 'הקישו מספר קטלוג אחר',
  price_word: 'מחיר',
  price_is_word: 'המחיר הוא',
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
  payment_intro: 'הינכם מועברים למערכת הסליקה המאובטחת הקישו את פרטי הכרטיס לפי ההנחיות',
  ask_pay_retry: 'הקישו אחת לתשלום או שתיים לביטול',
  cancelled: 'ההזמנה בוטלה תודה ולהתראות',
  paid_ok: 'התשלום התקבל בהצלחה',
  order_number: 'מספר ההזמנה שלכם',
  goodbye: 'תודה ויום טוב',
  paid_fail: 'התשלום לא אושר',
  paid_fail_retry: 'ההזמנה לא נקלטה ניתן לנסות שוב או לפנות למשרד',
  orders_none: 'לא נמצאו הזמנות הרשומות על מספר הטלפון שלכם',
  orders_intro: 'אלו ההזמנות הרשומות על מספר הטלפון שלכם',
  order_line: 'הזמנה מספר {number} בסך {total} שקלים סטטוס {status}',
  inquiry_intro: 'השאירו את פנייתכם לאחר הצפצוף ולסיום הקישו סולמית',
  inquiry_saved: 'פנייתכם נשמרה ונחזור אליכם בהקדם תודה',
  inquiry_failed: 'לא הצלחנו לשמור את הפנייה אנא נסו שוב או פנו למשרד',
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

  // ── סולמית = חזרה לתפריט הראשי, מכל שלב ──
  //
  // 🔴 הובטח למתקשר בברכה ("בכל שלב ניתן לעבור לתפריט הראשי על ידי
  // הקשה על סולמית"), ולכן חייב לעבוד בכל מצב — הבטחה שלא מתקיימת
  // גרועה מאי-הבטחה.
  //
  // ⚠️ לא בשלבי ההקלטה ולא בסליקה: שם הסולמית היא *סיום ההקלטה* ולא
  // ניווט, ויציאה באמצע סליקה הייתה משאירה הזמנה תלויה.
  const RECORDING_STEPS: IvrStep[] = ['record_address', 'ask_name', 'record_inquiry']
  if (
    input.value === '#' &&
    state.step !== 'payment' &&
    state.step !== 'welcome' &&
    !RECORDING_STEPS.includes(state.step)
  ) {
    return {
      // ⚠️ העגלה נשמרת — הסולמית היא ניווט, לא ביטול.
      state: { ...state, step: 'main_menu', attempts: 0 },
      response: readTap('bf_main_r', [m('main_menu')], { max: 1, seconds: 10 }),
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 הקשה 0 — סיום ההזמנה ומעבר לתשלום, מכל שלב בבחירת הספרים.
  //
  // מתקשר שכבר בחר את מה שרצה נאלץ עד כה להמשיך בזרימה עד שאלת
  // "ספר נוסף או סיום". 0 מקצר את הדרך מכל נקודה.
  //
  // ⚠️ רק כשיש *משהו* בעגלה: 0 בעגלה ריקה אינו "סיום" אלא הקשה
  // חסרת משמעות, והעברה לתשלום בלי פריטים הייתה יוצרת הזמנה ריקה.
  //
  // ⚠️ לא בהקלטות, לא בסליקה ולא בשלבים שאחרי בחירת הספרים: שם 0
  // הוא חלק מהקלט עצמו (כמות, קוד עיר, מספר טלפון) ולא פקודה.
  const CART_STEPS: IvrStep[] = [
    'main_menu', 'order_menu', 'category_menu', 'browse', 'ask_sku',
    'confirm_book', 'ask_more',
  ]
  if (input.value === '0' && state.items.length > 0 && CART_STEPS.includes(state.step)) {
    return askDelivery({ ...state, attempts: 0 }, messages)
  }

  switch (state.step) {

    // ── הברכה ואז התפריט הראשי ──
    //
    // 🔴 בדיוק כמו בשלוחת החגים שעובדת: הברכה היא id_list_message
    // נפרד, ורק אחריו read עם הודעה *אחת*.
    //
    // ⚠️ קודם כל ארבע ההודעות שורשרו לתוך ה-read אחד
    // (read=f-a.f-b.f-c.f-d=...) וכל מתקשר שמע "שגיאה" ונותק.
    // בחגים הדפוס הוא readTap(MENU_VAR, [msgToken(msgs,'main_menu')])
    // — טוקן בודד, בלי שרשור.
    // 🔴 הכול בתוך ה-read — כדי שאפשר יהיה להקיש מיד.
    //
    // ⚠️ קודם הברכה הייתה id_list_message נפרד: ימות משמיעה הודעה
    // כזו *עד הסוף* בלי לקלוט הקשה, ורק אחריה מגיעה ל-read. מתקשר
    // חוזר שיודע שהוא רוצה 1 נאלץ לשמוע את כל הפתיחה בכל שיחה.
    //
    // ⚠️ טוקנים בתוך read נקטעים בהקשה — זו בדיוק ההתנהגות הרצויה
    // בתפריט, ולכן כל הטוקנים עוברים לשם.
    case 'welcome':
      return {
        state: { ...state, step: 'main_menu', attempts: 0 },
        response: readTap(
          'bf_main',
          [m('welcome'), m('open_until'), m('to_menu'), m('main_menu')],
          { max: 1, min: 1, seconds: 10 },
        ),
      }

    // ── התפריט הראשי ──
    case 'main_menu': {
      if (input.value === '1') return orderMenu({ ...state, attempts: 0 }, messages)
      if (input.value === '2') return myOrdersTurn({ ...state, attempts: 0 }, input, messages)
      if (input.value === '3') {
        return {
          state: { ...state, step: 'record_inquiry', attempts: 0 },
          response: readRecord('bf_inq', [m('inquiry_intro')], 120),
        }
      }
      return retry(state, 'main_menu', 'bf_main', [
        m('main_menu_retry'), m('main_menu'),
      ], { max: 1, seconds: 10 }, false, messages)
    }

    // ── תפריט ההזמנה ──
    case 'order_menu': {
      if (input.value === '1') return askSkuTurn({ ...state, attempts: 0 }, messages)
      if (input.value === '2') return categoryMenu({ ...state, attempts: 0 }, input, messages)
      if (input.value === '3') {
        // 🔴 browse_category = null פירושו "כל הקטלוג", ולא "טרם נבחר".
        return browseTurn(
          { ...state, browse_category: null, browse_index: 0, attempts: 0 },
          input, messages,
        )
      }
      return retry(state, 'order_menu', 'bf_omenu', [
        m('main_menu_retry'), m('order_menu'),
      ], { max: 1, seconds: 10 }, false, messages)
    }

    // ── בחירת קטגוריה ──
    case 'category_menu': {
      const cats = input.categories ?? []
      const idx = Number(input.value) - 1
      if (!Number.isInteger(idx) || idx < 0 || idx >= cats.length) {
        return categoryMenu({ ...state, attempts: state.attempts + 1 }, input, messages, true)
      }
      return browseTurn(
        { ...state, browse_category: cats[idx], browse_index: 0, attempts: 0 },
        input, messages,
      )
    }

    // ── דפדוף ברשימת הספרים ──
    //
    // 🔴 1 בוחר · 2 חוזר אחורה · 3 יוצא. המתקשר שומע ספר אחד בכל פעם,
    // ולא רשימה של 114 שמות ברצף שאי אפשר לזכור.
    case 'browse': {
      const books = input.browseBooks ?? []
      const i = state.browse_index ?? 0

      if (input.value === '1') {
        const book = books[i]
        if (!book) return browseTurn(state, input, messages)
        return confirmBookTurn({ ...state, attempts: 0 }, book, messages)
      }
      if (input.value === '2') {
        // ⚠️ בתחילת הרשימה נשארים במקום עם הודעה, ולא גולשים ל-‎-1.
        if (i <= 0) return browseTurn({ ...state, attempts: 0 }, input, messages, 'start')
        return browseTurn({ ...state, browse_index: i - 1, attempts: 0 }, input, messages)
      }
      if (input.value === '3') {
        return state.browse_category
          ? categoryMenu({ ...state, attempts: 0 }, input, messages)
          : orderMenu({ ...state, attempts: 0 }, messages)
      }
      // ⚠️ כל הקשה אחרת = "הבא". זו ההתנהגות הצפויה כשמאזינים לרשימה.
      if (i + 1 >= books.length) {
        return browseTurn({ ...state, attempts: 0 }, input, messages, 'end')
      }
      return browseTurn({ ...state, browse_index: i + 1, attempts: 0 }, input, messages)
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
      // 🔴 אישור לפני כמות: המתקשר חייב לדעת *איזה* ספר נבחר לפני
      // שהוא מתחייב. הקשה שגויה במק"ט דומה הייתה מזמינה ספר אחר.
      return confirmBookTurn({ ...state, attempts: 0 }, book, messages)
    }

    // ── אישור הספר שנבחר ──
    case 'confirm_book': {
      const book = input.book
      if (input.value === '1') {
        if (!book) return askSkuTurn({ ...state, attempts: 0 }, messages)
        return {
          state: { ...state, step: 'ask_qty', attempts: 0 },
          response: readTap('bf_qty', [m('ask_qty')], { max: 2, seconds: 8 }),
        }
      }
      if (input.value === '2') {
        // תיקון — חזרה למקום שממנו הגיע.
        return state.browse_index !== undefined && state.browse_category !== undefined
          ? browseTurn({ ...state, attempts: 0 }, input, messages)
          : askSkuTurn({ ...state, attempts: 0 }, messages)
      }
      return retry(state, 'confirm_book', 'bf_cbook', [
        m('confirm_book'),
      ], { max: 1, seconds: 8 }, false, messages)
    }

    // ── ההזמנות הקיימות (שלוחה 2) ──
    case 'my_orders':
      return {
        state: { ...state, step: 'done' },
        response: `${idMessage(m('goodbye'))}&${hangup}`,
      }

    // ── פנייה לשירות לקוחות (שלוחה 3) ──
    case 'record_inquiry': {
      if (!input.recording) {
        return retry(state, 'record_inquiry', 'bf_inq', [
          m('no_recording'),
        ], { max: '', seconds: 120 }, true, messages)
      }
      return {
        state: { ...state, step: 'done' },
        response: `${idMessage(
          m(input.inquirySaved === false ? 'inquiry_failed' : 'inquiry_saved'),
        )}&${hangup}`,
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
        // ⚠️ שם המשתנה כולל את מספר הפריטים: בלי זה ההקשה על הספר
        // השני מקבלת את התשובה שניתנה על הראשון, והשיחה נתקעת.
        response: readTap(`bf_more${items.length}`, [
          m('book_saved'),
          m('added_to_cart', { qty, title: book.title }),
          m('after_save'),
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
      // ⚠️ אותו שם משתנה כמו ב-readTap שמעל (תלוי-כמות), אחרת הניסיון
      // החוזר קורא משתנה אחר ומקבל ערך ריק לנצח.
      return retry(state, 'ask_more', `bf_more${state.items.length}`, [
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
        // 🔴 payment_intro מוקראת כאן, רגע לפני שימות משתלטת: משם
        // והלאה *ימות* מקריאה את ההנחיות (מספר כרטיס, תוקף, שלוש
        // ספרות, ת"ז) בקול משלה, והמתקשר שמע מעבר פתאומי בלי הקשר.
        // ⚠️ ה-route מצרף אותה לפני שורת credit_card= — ראו שם.
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

/** תפריט ההזמנה: מק"ט / קטגוריות / כל הספרים. */
function orderMenu(state: IvrState, messages?: IvrMessages): IvrTurn {
  return {
    state: { ...state, step: 'order_menu' },
    response: readTap(attemptVarName('bf_omenu', state.attempts), [
      msgToken(messages, 'order_menu'),
    ], { max: 1, seconds: 10 }),
  }
}

/** בקשת מק"ט. */
function askSkuTurn(state: IvrState, messages?: IvrMessages): IvrTurn {
  const base = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
  return {
    state: { ...state, step: 'ask_sku' },
    response: readTap(attemptVarName(base, state.attempts), [
      msgToken(messages, 'ask_sku'),
    ], { max: 10, seconds: 10 }),
  }
}

/**
 * רשימת הקטגוריות.
 *
 * ⚠️ נבנית מהקטלוג ולא מרשימה קבועה: קטגוריה חדשה מופיעה מאליה,
 * ורשימה כתובה ביד הייתה נשארת מאחור.
 *
 * ⚠️ המספור הוא מיקום ברשימה (1..N) ולא קוד קבוע — המתקשר שומע
 * "ל<שם> הקישו <מספר>" ולכן הוא תמיד תואם למה שהוקרא.
 */
function categoryMenu(
  state: IvrState, input: IvrInput, messages?: IvrMessages, invalid = false,
): IvrTurn {
  const cats = input.categories ?? []
  if (!cats.length) {
    return {
      state: { ...state, step: 'done' },
      response: `${idMessage(msgToken(messages, 'category_empty'))}&${hangup}`,
    }
  }
  // 🔴 יותר מ-9 קטגוריות מחייב קריאת שתי ספרות, אחרת "10" נקרא כ-"1".
  const maxDigits = cats.length > 9 ? 2 : 1
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 הקלטה אחת לכל התפריט גוברת על הכול.
  //
  // כשיש הקלטה ל-category_menu, היא *המשפט המלא* — "לשאלות ותשובות
  // הקישו 1, לדרוש ואגדה הקישו 2..." — והיא מושמעת לבדה. זו הדרך
  // הפשוטה: קובץ אחד שהמנהל מקליט, במקום תשעה.
  //
  // ⚠️ ואז אין לצרף אחריה את רשימת הקטגוריות: המתקשר היה שומע את
  // כל הרשימה פעמיים, פעם בקול המוקלט ופעם ב-TTS.
  //
  // ⚠️ המחיר: הרשימה המוקלטת קבועה, ואילו רשימת הקטגוריות נבנית
  // מהקטלוג. הוספת קטגוריה או שינוי סדר מחייבים הקלטה מחדש — אחרת
  // מה שנשמע לא יתאים למה שההקשה באמת עושה.
  // ─────────────────────────────────────────────────────────────────────────
  const menuRecorded = !!messages?.['category_menu']?.audio

  const tokens = [
    ...(invalid ? [msgToken(messages, 'main_menu_retry')] : []),
    msgToken(messages, 'category_menu'),
    // כל קטגוריה בנפרד — רק כשאין הקלטה כוללת לתפריט.
    //
    // 🔴 הקלטה של קטגוריה בודדת מכילה גם את "הקישו X" בתוכה (המנהל
    // מקליט את המשפט המלא), ולכן אינה מלווה בשום טוקן נוסף אחריה.
    //
    // ⚠️ רק כשאין שום הקלטה נבנה המשפט מ-TTS — ואז {code} חובה בתוכו,
    // כי קובץ יחיד אינו יכול להקריא מספר משתנה בפני עצמו.
    ...(menuRecorded ? [] : cats.flatMap((name, i) => {
      const rec = input.categoryAudio?.[name]
      return rec
        ? [`f-${rec}`]
        : [msgToken(messages, 'category_item', { name, code: i + 1 })]
    })),
  ]
  return {
    state: { ...state, step: 'category_menu' },
    response: readTap(attemptVarName('bf_cat', state.attempts), tokens,
      { max: maxDigits, seconds: 12 }),
  }
}

/**
 * ספר אחד מתוך הרשימה, עם אפשרויות הניווט.
 *
 * 🔴 ספר אחד בכל פעם ולא 114 ברצף: רשימה ארוכה בטלפון אינה ניתנת
 * לזכירה, והמתקשר מנתק באמצע.
 */
function browseTurn(
  state: IvrState, input: IvrInput, messages?: IvrMessages,
  edge?: 'start' | 'end',
): IvrTurn {
  const books = input.browseBooks ?? []
  if (!books.length) {
    return {
      state: { ...state, step: 'done' },
      response: `${idMessage(msgToken(messages, 'category_empty'))}&${hangup}`,
    }
  }

  const i = Math.min(Math.max(state.browse_index ?? 0, 0), books.length - 1)
  const book = books[i]
  const navKey = state.browse_category ? 'list_nav' : 'list_all_nav'

  return {
    state: { ...state, step: 'browse', browse_index: i },
    // ⚠️ שם משתנה שכולל את האינדקס: בלעדיו ימות מחזירה את ההקשה
    // הקודמת והדפדוף נתקע על אותו ספר.
    response: readTap(attemptVarName(`bf_br${i}`, state.attempts), [
      ...(edge === 'end' ? [msgToken(messages, 'list_end')] : []),
      ...(edge === 'start' ? [msgToken(messages, 'list_start')] : []),
      t(ttsClean(book.title)),
      msgToken(messages, 'price_word'),
      n(agorotToSpokenShekels(book.price_agorot)),
      msgToken(messages, 'shekels_word'),
      msgToken(messages, navKey),
    ], { max: 1, seconds: 10 }),
  }
}

/**
 * "בחרתם X המחיר Y" → 1 אישור · 2 תיקון.
 *
 * 🔴 כשלספר יש הקלטה משלו (audio_name), ההודעה מתפצלת לשלושה:
 * "בחרתם" → *הקלטת שם הספר* → "המחיר X שקלים". בלי זה שם הספר
 * מוקרא ב-TTS, ושמות ספרי קודש ("שו״ת חתם סופר") יוצאים משובשים.
 *
 * ⚠️ הפיצול נחוץ כי קובץ יחיד אינו יכול להכיל מחיר משתנה — לכן
 * `book_chosen` (עם {title} ו-{price}) לעולם אינו הקלטה.
 */
function confirmBookTurn(
  state: IvrState,
  book: { id: string; title: string; price_agorot: number; audio_name?: string | null },
  messages?: IvrMessages,
): IvrTurn {
  const price = agorotToSpokenShekels(book.price_agorot)
  // ⚠️ גם הקלטת הספר כפופה לתקרה — ראו MAX_FILES_PER_RESPONSE
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 המחיר מפוצל לשלושה כדי שהמילים יוכלו להיות מוקלטות:
  //     "המחיר הוא" (הקלטה) → <מספר> (n- דינמי) → "שקלים" (הקלטה).
  //
  // ⚠️ book_chosen_price הוא allowAudio:false ולעולם לא יהיה הקלטה —
  // הוא מכיל {price} משתנה, וקובץ יחיד אינו יכול להקריא מספר שמשתנה
  // מספר לספר. לכן המשפט כולו נשמע ב-TTS מתכתי, כולל המילים הקבועות.
  //
  // ⚠️ המספר עצמו נשאר n- תמיד — זה בלתי נמנע, וזו גם הדרך שבה ימות
  // מקריאה מספרים נכון בעברית.
  // ─────────────────────────────────────────────────────────────────────────
  const priceTokens = [
    msgToken(messages, 'price_is_word'),
    n(price),
    msgToken(messages, 'shekels_word'),
  ].filter(Boolean)

  const tokens = book.audio_name
    ? [msgToken(messages, 'book_chosen_prefix'), `f-${book.audio_name}`, ...priceTokens]
    : [msgToken(messages, 'book_chosen_prefix'), t(ttsClean(book.title)), ...priceTokens]

  return {
    state: { ...state, step: 'confirm_book', pending_book_id: book.id },
    response: readTap(attemptVarName('bf_cbook', state.attempts), [
      ...tokens,
      msgToken(messages, 'confirm_book'),
    ], { max: 1, seconds: 10 }),
  }
}

/**
 * הקראת ההזמנות הקיימות של המתקשר.
 *
 * ⚠️ מנתק בסוף ואינו חוזר לתפריט: מי שביקש לשמוע את הזמנותיו קיבל
 * את מבוקשו, והחזרה לתפריט בטלפון מבלבלת יותר משהיא עוזרת.
 */
function myOrdersTurn(state: IvrState, input: IvrInput, messages?: IvrMessages): IvrTurn {
  const orders = input.myOrders ?? []
  if (!orders.length) {
    return {
      state: { ...state, step: 'done' },
      response: `${idMessage(msgToken(messages, 'orders_none'))}&${hangup}`,
    }
  }
  const lines = orders.map(o => msgToken(messages, 'order_line', {
    number: o.order_number,
    total: agorotToSpokenShekels(o.total_agorot),
    status: o.status,
  }))
  return {
    state: { ...state, step: 'done' },
    response: `${idMessage(
      msgToken(messages, 'orders_intro'),
      ...lines,
      msgToken(messages, 'goodbye'),
    )}&${hangup}`,
  }
}

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
