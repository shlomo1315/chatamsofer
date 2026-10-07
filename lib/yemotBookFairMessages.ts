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
  // ── פתיחה ותפריט ראשי ──
  { key: 'welcome', label: 'ברכת פתיחה', defaultText: 'שלום וברכה הגעתם למערכת הזמנת ספרי החתם סופר שעל ידי ממלכת היכל החתם סופר', allowAudio: true,
    hint: 'מוקראת בתחילת כל שיחה. ⚠️ להימנע מפסיקים ונקודות ומגרשיים — הם משבשים את ההקראה של ימות.' },
  { key: 'open_until', label: 'מועד סגירת ההזמנות', defaultText: 'המערכת פתוחה להזמנות עד יום שלישי כ"ה בתשרי בשעה עשר בלילה', allowAudio: true,
    hint: '🔴 הודעת־עובדה. יש לעדכן אותה כשהמועד משתנה — נוסח שפג מטעה את כל המתקשרים.' },
  { key: 'to_menu', label: 'הסבר הסולמית', defaultText: 'הינכם מועברים לתפריט בכל שלב ניתן לעבור לתפריט הראשי על ידי הקשה על סולמית', allowAudio: true },
  { key: 'main_menu', label: 'התפריט הראשי', defaultText: 'להזמנה חדשה הקישו 1 לשמיעת פרטי הזמנה קיימת הקישו 2 להשארת פנייה לשירות לקוחות הקישו 3', allowAudio: true,
    hint: '⚠️ המספרים כאן חייבים להתאים למה שהתפריט באמת מקבל.' },
  { key: 'main_menu_retry', label: 'הקשה שגויה בתפריט הראשי', defaultText: 'הקשה שגויה', allowAudio: true },

  // ── תפריט ההזמנה (שלוחה 1) ──
  { key: 'order_menu', label: 'תפריט ההזמנה', defaultText: 'לזיהוי ספר לפי מספר קטלוג הקישו 1 לשמיעת שמות הספרים לפי קטגוריה הקישו 2 לשמיעת כל הספרים ברצף הקישו 3', allowAudio: true },
  { key: 'ask_sku', label: 'בקשת מספר קטלוג', defaultText: 'הקישו את מספר הקטלוג של הספר המבוקש ולאחריו סולמית', allowAudio: true },
  { key: 'season_closed', label: 'היריד נסגר לשנה זו', defaultText: 'היריד נסגר לשנה זו', allowAudio: true,
    hint: 'מושמע כשהיריד סגור לעונה (book_fair_season_closed), במקום כל התפריט.' },
  { key: 'closed', label: 'היריד סגור', defaultText: 'היריד סגור כרגע להזמנות', allowAudio: true,
    hint: 'מוקראת כשהיריד אינו פתוח. 🔴 ודאו שהנוסח נכון לעובדה ולא זמני — הודעה זמנית על הודעת-עובדה בלבלה בעבר אלפי מתקשרים.' },

  // ── קטגוריות ורשימות ──
  { key: 'category_menu', label: 'תפריט הקטגוריות', defaultText: 'לשמיעת הספרים בקטגוריה הקישו את מספרה', allowAudio: true,
    hint: 'אחריה מוקראת רשימת הקטגוריות, שנבנית אוטומטית מהקטלוג.' },
  { key: 'category_item', label: 'תבנית שורת קטגוריה', defaultText: 'ל{name} הקישו {code}', allowAudio: false, placeholders: ['name', 'code'],
    hint: 'הודעה דינמית — חובה לכלול {name} ו-{code}. אין הקלטה כי הקטגוריות משתנות.' },
  { key: 'category_empty', label: 'קטגוריה ריקה', defaultText: 'אין כרגע ספרים בקטגוריה זו', allowAudio: true },
  { key: 'list_nav', label: 'הניווט ברשימת הספרים', defaultText: 'לבחירת ספר זה הקישו 1 לספר הבא הקישו 2 לספר הקודם הקישו 3 לחזרה לרשימת הקטגוריות הקישו 4 לסיום ההזמנה הקישו 0', allowAudio: true },
  { key: 'list_all_nav', label: 'הניווט ברשימת כל הספרים', defaultText: 'לבחירת ספר זה הקישו 1 לספר הבא הקישו 2 לספר הקודם הקישו 3 לחזרה לתפריט הקישו 4 לסיום ההזמנה הקישו 0', allowAudio: true },
  { key: 'list_end', label: 'סוף הרשימה', defaultText: 'הגעתם לסוף הרשימה', allowAudio: true },
  { key: 'list_start', label: 'תחילת הרשימה', defaultText: 'זהו הספר הראשון ברשימה', allowAudio: true },

  // ── בחירת ספר ──
  { key: 'book_chosen', label: 'אישור בחירת ספר', defaultText: 'בחרתם {title} המחיר הוא {price} שקלים', allowAudio: false, placeholders: ['title', 'price'],
    hint: 'הודעה דינמית — חובה לכלול {title} ו-{price}. נשמעת רק כשלספר אין הקלטה משלו.' },
  // ⚠️ שני אלה משמשים רק כשלספר *יש* הקלטה: ההודעה מתפצלת סביבה —
  // "בחרתם" → הקלטת שם הספר → "המחיר הוא X שקלים".
  { key: 'book_chosen_prefix', label: 'לפני שם ספר מוקלט', defaultText: 'בחרתם', allowAudio: true,
    hint: 'נשמע לפני הקלטת שם הספר, כשיש לו הקלטה.' },
  // 🔴 "המחיר הוא" בנפרד מהסכום — כדי שהמילים *כן* יהיו ניתנות להקלטה.
  // ⚠️ book_chosen_price הישן נשאר רק לתאימות נוסחים שמורים; הוא אינו
  // בשימוש יותר, כי {price} בתוכו מנע הקלטה והכתיב TTS למשפט כולו.
  { key: 'price_is_word', label: 'המילים "המחיר הוא"', defaultText: 'המחיר הוא', allowAudio: true,
    hint: 'נשמע לפני הסכום. הסכום עצמו נאמר במספרים ואינו ניתן להקלטה (הוא משתנה מספר לספר).' },
  { key: 'book_chosen_price', label: 'אחרי שם ספר מוקלט (לא בשימוש)', defaultText: 'המחיר הוא {price} שקלים', allowAudio: false, placeholders: ['price'],
    hint: 'אינו בשימוש — המחיר מורכב מ"המחיר הוא" + הסכום + "שקלים".' },
  { key: 'confirm_book', label: 'אישור או תיקון', defaultText: 'לאישור הקישו 1 לתיקון הקישו 2', allowAudio: true },
  { key: 'book_saved', label: 'הספר נשמר', defaultText: 'הספר נשמר בהצלחה', allowAudio: true },
  { key: 'after_save', label: 'ספר נוסף או תשלום', defaultText: 'להזמנת ספר נוסף הקישו 1 למעבר לתשלום הקישו 2', allowAudio: true },
  { key: 'sku_not_found', label: 'מספר קטלוג לא נמצא', defaultText: 'מספר הקטלוג שהקשתם לא נמצא', allowAudio: true },
  { key: 'sku_retry', label: 'בקשת ניסיון חוזר למק"ט', defaultText: 'נסו שוב או המתינו לנציג', allowAudio: true },
  { key: 'book_sold_out', label: 'הספר אזל', defaultText: 'הספר {title} אזל מהמלאי', allowAudio: false, placeholders: ['title'],
    hint: 'הודעה דינמית — חובה לכלול {title}. אין אפשרות הקלטה כי שם הספר משתנה.' },
  { key: 'ask_sku_other', label: 'בקשת מק"ט אחר', defaultText: 'הקישו מספר קטלוג אחר', allowAudio: true },
  { key: 'price_word', label: 'המילה "מחיר"', defaultText: 'מחיר', allowAudio: true,
    hint: 'מוקראת לפני הסכום. הסכום עצמו נאמר במספרים ואינו ניתן להקלטה.' },
  { key: 'shekels_word', label: 'המילה "שקלים"', defaultText: 'שקלים', allowAudio: true },
  { key: 'ask_qty', label: 'בקשת כמות', defaultText: 'נא הקישו את הכמות שברצונכם להזמין ולסיום הקישו סולמית', allowAudio: true },
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
  { key: 'ask_city', label: 'בקשת עיר המשלוח', defaultText: 'לאיזו עיר יישלחו הספרים', allowAudio: true,
    hint: 'אחריה מוקראת רשימת הערים, שנבנית אוטומטית מערי המשלוח הפעילות.' },
  { key: 'city_item', label: 'תבנית שורת עיר', defaultText: 'ל{name} הקישו {code}', allowAudio: false, placeholders: ['name', 'code'],
    hint: 'הודעה דינמית — חובה לכלול {name} ו-{code}. אין הקלטה כי הערים משתנות.' },
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

  // ── הקראת התמלול לאישור ──
  { key: 'heard_address', label: 'לפני הקראת הכתובת שתומללה', defaultText: 'הכתובת שנקלטה היא', allowAudio: true,
    hint: 'אחריה מוקרא התמלול של מה שהמתקשר אמר, ואז נוסח האישור.' },
  { key: 'heard_name', label: 'לפני הקראת השם שתומלל', defaultText: 'השם שנקלט הוא', allowAudio: true },
  { key: 'confirm_heard', label: 'אישור או הקלטה מחדש', defaultText: 'אם זה נכון הקישו 1 להקלטה מחדש הקישו 2', allowAudio: true,
    hint: '⚠️ המספרים חייבים להתאים: 1 = נכון · 2 = הקלטה מחדש.' },

  // ── סיכום ותשלום ──
  { key: 'total_books', label: 'סך ההזמנה — פתיחה', defaultText: 'סך ההזמנה', allowAudio: true },
  { key: 'for_books', label: 'שקלים עבור הספרים', defaultText: 'שקלים עבור הספרים', allowAudio: true },
  { key: 'plus_shipping', label: 'המילה "ועוד" (לפני דמי משלוח)', defaultText: 'ועוד', allowAudio: true },
  { key: 'shipping_fee_word', label: 'שקלים דמי משלוח', defaultText: 'שקלים דמי משלוח', allowAudio: true },
  { key: 'no_shipping_fee', label: 'ללא דמי משלוח', defaultText: 'ללא דמי משלוח', allowAudio: true },
  { key: 'grand_total', label: 'סך הכל לתשלום', defaultText: 'סך הכל לתשלום', allowAudio: true },
  { key: 'ask_pay', label: 'לתשלום או ביטול', defaultText: 'לתשלום בכרטיס אשראי הקישו אחת לביטול ההזמנה הקישו שתיים', allowAudio: true },
  // 🔴 מוקראת רגע לפני שימות משתלטת על הסליקה: משם והלאה *ימות*
  // מקריאה את ההנחיות (מספר כרטיס, תוקף, CVV, ת"ז), והמתקשר שומע
  // פתאום קול אחר בלי הקשר. הודעת המעבר מכינה אותו לכך.
  { key: 'payment_intro', label: 'לפני מסירת פרטי האשראי', defaultText: 'הינכם מועברים למערכת הסליקה המאובטחת הקישו את פרטי הכרטיס לפי ההנחיות', allowAudio: true,
    hint: 'ההנחיות עצמן (מספר כרטיס, תוקף, שלוש ספרות, תעודת זהות) מוקראות ע"י ימות ונערכות בממשק ימות — לא כאן.' },
  { key: 'ask_pay_retry', label: 'חזרה על תשלום/ביטול', defaultText: 'הקישו אחת לתשלום או שתיים לביטול', allowAudio: true },
  { key: 'cancelled', label: 'ההזמנה בוטלה', defaultText: 'ההזמנה בוטלה תודה ולהתראות', allowAudio: true },

  // ── סיום ──
  { key: 'paid_ok', label: 'התשלום התקבל', defaultText: 'התשלום התקבל בהצלחה', allowAudio: true },
  { key: 'order_number', label: 'מספר ההזמנה שלכם', defaultText: 'מספר ההזמנה שלכם', allowAudio: true },
  { key: 'goodbye', label: 'פרידה', defaultText: 'תודה ויום טוב', allowAudio: true },
  { key: 'paid_fail', label: 'התשלום לא אושר', defaultText: 'התשלום לא אושר', allowAudio: true },
  // 🔴 נאמר כשאין CreditCard_CODE — ייתכן שהחיוב עבר ואיננו יודעים.
  { key: 'paid_unknown', label: 'תוצאת תשלום לא ידועה', defaultText: 'ההזמנה נקלטה ואנו בודקים את התשלום נציג יחזור אליכם בהקדם', allowAudio: true },
  { key: 'paid_fail_retry', label: 'הסבר אחרי כשל תשלום', defaultText: 'ההזמנה לא נקלטה ניתן לנסות שוב או לפנות למשרד', allowAudio: true },

  // ── הזמנה קיימת (שלוחה 2) ──
  { key: 'orders_none', label: 'לא נמצאו הזמנות', defaultText: 'לא נמצאו הזמנות הרשומות על מספר הטלפון שלכם', allowAudio: true },
  { key: 'orders_intro', label: 'הקדמה לרשימת ההזמנות', defaultText: 'אלו ההזמנות הרשומות על מספר הטלפון שלכם', allowAudio: true },
  // 🔴 שורת ההזמנה פוצלה למילות קישור נפרדות, כדי שכל אחת תוכל
  // להיות מוקלטת בקול טבעי. קודם הייתה תבנית אחת עם {placeholders}
  // שחייבה TTS לכל המשפט.
  //
  // ⚠️ המספר עצמו מוקרא ספרה-ספרה (d-) ואינו נוסח שניתן לעריכה.
  { key: 'order_num_word', label: 'שורת הזמנה — "הזמנה מספר"', defaultText: 'הזמנה מספר', allowAudio: true },
  { key: 'order_sum_word', label: 'שורת הזמנה — "בסך"', defaultText: 'בסך', allowAudio: true },
  { key: 'order_status_word', label: 'שורת הזמנה — "שקלים סטטוס"', defaultText: 'שקלים סטטוס', allowAudio: true },
  { key: 'status_paid', label: 'סטטוס — שולם', defaultText: 'שולם וההזמנה בטיפול', allowAudio: true },
  { key: 'status_picking', label: 'סטטוס — בליקוט', defaultText: 'ההזמנה בליקוט', allowAudio: true },
  { key: 'status_packed', label: 'סטטוס — נארז', defaultText: 'ההזמנה נארזה', allowAudio: true },
  { key: 'status_shipped', label: 'סטטוס — נשלח', defaultText: 'ההזמנה נשלחה', allowAudio: true },
  { key: 'status_delivered', label: 'סטטוס — נמסר', defaultText: 'ההזמנה נמסרה', allowAudio: true },
  { key: 'status_refunded', label: 'סטטוס — זוכה', defaultText: 'ההזמנה זוכתה', allowAudio: true },
  { key: 'status_partially_refunded', label: 'סטטוס — זוכה חלקית', defaultText: 'ההזמנה זוכתה חלקית', allowAudio: true },

  // ── פנייה לשירות לקוחות (שלוחה 3) ──
  { key: 'inquiry_intro', label: 'בקשת הקלטת פנייה', defaultText: 'השאירו את פנייתכם לאחר הצפצוף ולסיום הקישו סולמית', allowAudio: true },
  { key: 'inquiry_saved', label: 'הפנייה נשמרה', defaultText: 'פנייתכם נשמרה ונחזור אליכם בהקדם תודה', allowAudio: true },
  { key: 'inquiry_failed', label: 'הפנייה לא נקלטה', defaultText: 'לא הצלחנו לשמור את הפנייה אנא נסו שוב או פנו למשרד', allowAudio: true },

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
