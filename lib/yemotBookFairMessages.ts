// הודעות שלוחת יריד הספרים בימות — טקסט ניתן לעריכה + הקלטה לכל הודעה.
// נשמר ב-app_settings תחת 'yemot_book_fair_messages' (JSON של key → { text, audio }).
//
// 🔴 הנוסחים היו מוטמעים בקוד (lib/bookFairYemotIvr.ts) ולכן כל תיקון
// מילה דרש פריסה. כאן הם נתונים, כמו בשאר השלוחות.
//
// ⚠️ audio = שם קובץ ההקלטה בימות. כשהוא קיים הוא מושמע *במקום* ה-TTS.
// זו בדיוק המלכודת שתפסה אותנו בעבר: הקלטה גוברת על הטקסט תמיד, ולכן
// עריכת טקסט בלי להסיר הקלטה ישנה אינה משנה דבר בטלפון.
import { getServiceClient } from '@/lib/apiAuth'

export const BOOK_FAIR_MSG_KEY = 'yemot_book_fair_messages'

export type BookFairMsg = { text: string; audio?: string | null }
export type BookFairMessages = Record<string, BookFairMsg>

export type MsgMeta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}

// ⚠️ allowAudio=false להודעות עם משתנה {...}: קובץ אחד אינו יכול
// להקריא שם ספר או סכום משתנים, ולכן הקלטה שם הייתה משקרת.
export const BOOK_FAIR_MESSAGE_META: MsgMeta[] = [
  // ── פתיחה ──
  { key: 'welcome', label: 'ברכת פתיחה', defaultText: 'ברוכים הבאים ליריד הספרים של היכל החתם סופר', allowAudio: true,
    hint: 'מוקראת בתחילת כל שיחה. להימנע מפסיקים ונקודות — הם משבשים את ההקראה.' },
  { key: 'ask_sku', label: 'בקשת מספר קטלוג', defaultText: 'להזמנת ספר הקישו את מספר הקטלוג ולאחריו סולמית', allowAudio: true },
  { key: 'closed', label: 'היריד סגור', defaultText: 'היריד סגור כרגע להזמנות', allowAudio: true,
    hint: 'מוקראת כשהיריד אינו פתוח. 🔴 ודאו שהנוסח נכון לעובדה ולא זמני — הודעה זמנית על הודעת-עובדה בלבלה בעבר אלפי מתקשרים.' },

  // ── בחירת ספר ──
  { key: 'sku_not_found', label: 'מספר קטלוג לא נמצא', defaultText: 'מספר הקטלוג שהקשתם לא נמצא', allowAudio: true },
  { key: 'sku_retry', label: 'בקשת ניסיון חוזר למק"ט', defaultText: 'נסו שוב או המתינו לנציג', allowAudio: true },
  { key: 'book_sold_out', label: 'הספר אזל', defaultText: 'הספר {title} אזל מהמלאי', allowAudio: false, placeholders: ['title'],
    hint: 'הודעה דינמית — חובה לכלול {title}. אין אפשרות הקלטה כי שם הספר משתנה.' },
  { key: 'ask_sku_other', label: 'בקשת מק"ט אחר', defaultText: 'הקישו מספר קטלוג אחר', allowAudio: true },
  { key: 'price_word', label: 'המילה "מחיר"', defaultText: 'מחיר', allowAudio: true,
    hint: 'מוקראת לפני הסכום. הסכום עצמו נאמר במספרים ואינו ניתן להקלטה.' },
  { key: 'shekels_word', label: 'המילה "שקלים"', defaultText: 'שקלים', allowAudio: true },
  { key: 'ask_qty', label: 'בקשת כמות', defaultText: 'כמה עותקים הקישו מספר ולאחריו סולמית', allowAudio: true },
  { key: 'qty_invalid', label: 'כמות לא תקינה', defaultText: 'הקישו מספר בין אחד ל{max}', allowAudio: false, placeholders: ['max'],
    hint: 'הודעה דינמית — {max} הוא הכמות המקסימלית להזמנה אחת.' },
  { key: 'qty_unavailable', label: 'הכמות אינה זמינה במלאי', defaultText: 'מצטערים הכמות המבוקשת אינה זמינה', allowAudio: true },

  // ── סל ──
  { key: 'added_to_cart', label: 'אישור הוספה לסל', defaultText: 'נוספו לסל {qty} עותקים של {title}', allowAudio: false, placeholders: ['qty', 'title'],
    hint: 'הודעה דינמית — חובה לכלול {qty} ו-{title}.' },
  { key: 'ask_more', label: 'ספר נוסף או סיום', defaultText: 'להוספת ספר נוסף הקישו אחת לסיום ההזמנה הקישו שתיים', allowAudio: true },
  { key: 'ask_more_retry', label: 'חזרה על ספר נוסף/סיום', defaultText: 'הקישו אחת להוספת ספר או שתיים לסיום', allowAudio: true },
  { key: 'ask_next_sku', label: 'בקשת מק"ט של הספר הבא', defaultText: 'הקישו את מספר הקטלוג של הספר הבא', allowAudio: true },

  // ── אספקה ──
  { key: 'ask_delivery', label: 'איסוף או משלוח', defaultText: 'לאיסוף עצמי מהיריד הקישו אחת למשלוח עד הבית הקישו שתיים', allowAudio: true,
    hint: '⚠️ באתר האיסוף העצמי בוטל, אך בטלפון הוא נשאר. אם גם כאן יבוטל — יש לעדכן את הנוסח.' },
  { key: 'ask_delivery_retry', label: 'חזרה על איסוף/משלוח', defaultText: 'הקישו אחת לאיסוף עצמי או שתיים למשלוח', allowAudio: true },
  { key: 'ask_city', label: 'בקשת קוד עיר', defaultText: 'הקישו את קוד העיר שאליה יישלחו הספרים', allowAudio: true },
  { key: 'city_unknown', label: 'קוד עיר לא מוכר', defaultText: 'קוד העיר שהקשתם אינו מוכר', allowAudio: true },
  { key: 'city_list_only', label: 'משלוח לערים שברשימה בלבד', defaultText: 'משלוחים מתבצעים לערים שבמוקד בלבד הקישו קוד עיר אחר', allowAudio: true },
  { key: 'shipping_unavailable', label: 'לא ניתן לחשב דמי משלוח', defaultText: 'לא ניתן לחשב את דמי המשלוח להזמנה זו', allowAudio: true },
  { key: 'call_office', label: 'הפניה למשרד', defaultText: 'אנא התקשרו למשרד להשלמת ההזמנה', allowAudio: true },
  { key: 'shipping_to', label: 'אישור עיר המשלוח', defaultText: 'משלוח ל{city}', allowAudio: false, placeholders: ['city'],
    hint: 'הודעה דינמית — חובה לכלול {city}.' },
  { key: 'ask_address', label: 'בקשת כתובת בהקלטה', defaultText: 'אמרו את הרחוב מספר הבית ומספר הדירה ולאחר מכן הקישו סולמית', allowAudio: true },
  { key: 'no_recording', label: 'לא נקלטה הקלטה', defaultText: 'לא נקלטה הקלטה נסו שוב', allowAudio: true },

  // ── שם המזמין ──
  { key: 'ask_name', label: 'בקשת שם מלא', defaultText: 'אמרו את שמכם המלא ולאחר מכן הקישו סולמית', allowAudio: true },
  { key: 'no_name_recording', label: 'לא נקלט שם', defaultText: 'לא נקלטה הקלטה אמרו את שמכם המלא', allowAudio: true },

  // ── סיכום ותשלום ──
  { key: 'total_books', label: 'סך ההזמנה — פתיחה', defaultText: 'סך ההזמנה', allowAudio: true },
  { key: 'for_books', label: 'שקלים עבור הספרים', defaultText: 'שקלים עבור הספרים', allowAudio: true },
  { key: 'plus_shipping', label: 'המילה "ועוד" (לפני דמי משלוח)', defaultText: 'ועוד', allowAudio: true },
  { key: 'shipping_fee_word', label: 'שקלים דמי משלוח', defaultText: 'שקלים דמי משלוח', allowAudio: true },
  { key: 'no_shipping_fee', label: 'ללא דמי משלוח', defaultText: 'ללא דמי משלוח', allowAudio: true },
  { key: 'grand_total', label: 'סך הכל לתשלום', defaultText: 'סך הכל לתשלום', allowAudio: true },
  { key: 'ask_pay', label: 'לתשלום או ביטול', defaultText: 'לתשלום בכרטיס אשראי הקישו אחת לביטול ההזמנה הקישו שתיים', allowAudio: true },
  { key: 'ask_pay_retry', label: 'חזרה על תשלום/ביטול', defaultText: 'הקישו אחת לתשלום או שתיים לביטול', allowAudio: true },
  { key: 'cancelled', label: 'ההזמנה בוטלה', defaultText: 'ההזמנה בוטלה תודה ולהתראות', allowAudio: true },

  // ── סיום ──
  { key: 'paid_ok', label: 'התשלום התקבל', defaultText: 'התשלום התקבל בהצלחה', allowAudio: true },
  { key: 'order_number', label: 'מספר ההזמנה שלכם', defaultText: 'מספר ההזמנה שלכם', allowAudio: true },
  { key: 'goodbye', label: 'פרידה', defaultText: 'תודה ויום טוב', allowAudio: true },
  { key: 'paid_fail', label: 'התשלום לא אושר', defaultText: 'התשלום לא אושר', allowAudio: true },
  { key: 'paid_fail_retry', label: 'הסבר אחרי כשל תשלום', defaultText: 'ההזמנה לא נקלטה ניתן לנסות שוב או לפנות למשרד', allowAudio: true },

  // ── שגיאות ──
  { key: 'order_error', label: 'שגיאה ביצירת ההזמנה', defaultText: 'שגיאה ביצירת ההזמנה אנא פנו למשרד', allowAudio: true },
  { key: 'input_error', label: 'לא נקלטה בחירה', defaultText: 'לא הצלחנו לקלוט את הבחירה', allowAudio: true },
  { key: 'server_error', label: 'שגיאת שרת', defaultText: 'שגיאת שרת', allowAudio: true },
]

const META_BY_KEY = new Map(BOOK_FAIR_MESSAGE_META.map((m) => [m.key, m]))

export function defaultMessages(): BookFairMessages {
  const out: BookFairMessages = {}
  for (const m of BOOK_FAIR_MESSAGE_META) out[m.key] = { text: m.defaultText, audio: null }
  return out
}

/**
 * טוען את ההודעות — ברירות המחדל ממוזגות עם מה שנשמר.
 *
 * ⚠️ המיזוג הוא על ברירות המחדל ולא על מה שנשמר: הודעה שנוספה לקוד
 * ואינה במסד מקבלת את ברירת המחדל שלה, במקום להיעלם מהשלוחה.
 */
export async function getBookFairMessages(): Promise<BookFairMessages> {
  const merged = defaultMessages()
  const admin = getServiceClient()
  if (!admin) return merged

  const { data } = await admin.from('app_settings').select('value').eq('key', BOOK_FAIR_MSG_KEY).maybeSingle()
  if (data?.value) {
    try {
      // 🔴 app_settings.value היא עמודת text — הערך נשמר כ-JSON מסודרת.
      const saved = JSON.parse(data.value) as BookFairMessages
      for (const key of Object.keys(merged)) {
        const s = saved[key]
        if (!s) continue
        merged[key] = {
          text: typeof s.text === 'string' && s.text.trim() ? s.text : merged[key].text,
          audio: META_BY_KEY.get(key)?.allowAudio ? (s.audio ?? null) : null,
        }
      }
    } catch { /* value אינו JSON תקין — חוזרים לברירות המחדל */ }
  }
  return merged
}

export async function saveBookFairMessages(input: BookFairMessages): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false

  const current = await getBookFairMessages()
  for (const key of Object.keys(current)) {
    const i = input[key]
    if (!i) continue
    const prevText = current[key].text
    const prevAudio = current[key].audio ?? null
    const newText = typeof i.text === 'string' && i.text.trim() ? i.text.trim() : prevText
    let audio = META_BY_KEY.get(key)?.allowAudio ? (i.audio ?? prevAudio) : null

    // 🔴 הטקסט השתנה ויש קול שנוצר אוטומטית (tts_) — מנקים אותו.
    // בלי זה ההקלטה הישנה ממשיכה להתנגן לנצח בעוד הטקסט במסך נראה
    // מעודכן, בלי שום סימן לכך שמשהו לא בסדר.
    if (audio && audio.startsWith('tts_') && newText !== prevText) audio = null

    current[key] = { text: newText, audio: audio ?? null }
  }

  const { error } = await admin.from('app_settings').upsert(
    // ⚠️ JSON.stringify חובה — שמירת אובייקט גולמי לעמודת text נכשלת
    // בשקט ומאחסנת "[object Object]".
    { key: BOOK_FAIR_MSG_KEY, value: JSON.stringify(current), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

/** עדכון/מחיקת קובץ הקלטה להודעה בודדת (audio=null מסיר). */
export async function setBookFairMessageAudio(key: string, audio: string | null): Promise<boolean> {
  if (!META_BY_KEY.get(key)?.allowAudio) return false
  const msgs = await getBookFairMessages()
  if (!msgs[key]) return false
  msgs[key] = { ...msgs[key], audio }
  return saveBookFairMessages(msgs)
}
