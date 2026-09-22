// ─────────────────────────────────────────────────────────────────────────────
// יריד ספרים — ייבוא קטלוג מאקסל.
//
// הקובץ הזה *טהור*: הוא מקבל מערך שורות גולמיות ומחזיר תוצאה מובנית.
// אין בו קריאת קובץ, אין מסד ואין רשת — כדי שכל כלל ייבוא ייבדק ביחידה.
//
// 🔴 העיקרון המנחה: הייבוא לעולם אינו כותב "מה שהצליח" ומדלג בשקט על
// השאר. כל שורה מסווגת — תקינה / שגויה / כפולה — והמשתמש רואה את
// הסיווג המלא *לפני* שמשהו נשמר. קובץ שנכנס חלקית בלי שאיש ידע הוא
// קטלוג שקרי: ספרים שאינם בו פשוט לא יימכרו, ואיש לא יבין למה.
// ─────────────────────────────────────────────────────────────────────────────

import { shekelsToAgorot } from './bookFairPricing'

// ─────────────────────────────────────────────────────────────────────────────
// מיפוי כותרות
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ המשתמש מכין את הקובץ בעצמו, ולכן הכותרות לא יהיו זהות לתבנית: "מחיר"
// מול "מחיר בשקלים", "מק״ט" בגרשיים מול "מקט" בלעדיהם. דחיית קובץ בגלל
// כותרת שנוסחה אחרת היא כישלון של הכלי, לא של המשתמש.

/** שדות היעד בקטלוג. */
export type BookField =
  | 'sku' | 'title' | 'author' | 'publisher'
  | 'volumes' | 'price' | 'stock_web' | 'stock_phone' | 'phone_code'

/**
 * כינויים מוכרים לכל שדה. ההשוואה מתבצעת אחרי נרמול (ראו normalizeHeader),
 * ולכן אין צורך לכלול כאן וריאציות של גרשיים, רווחים או מקפים.
 */
const HEADER_ALIASES: Record<BookField, string[]> = {
  sku:         ['מקט', 'מק ט', 'קוד', 'קוד מוצר', 'קטלוגי', 'מספר קטלוגי', 'sku', 'code'],
  title:       ['שם', 'שם הספר', 'שם ספר', 'כותר', 'ספר', 'title', 'name'],
  author:      ['מחבר', 'שם המחבר', 'author'],
  publisher:   ['הוצאה', 'הוצאת ספרים', 'מוציא לאור', 'publisher'],
  volumes:     ['כרכים', 'מספר כרכים', 'כמות כרכים', 'volumes'],
  price:       ['מחיר', 'מחיר בשקלים', 'מחיר לצרכן', 'עלות', 'price'],
  stock_web:   ['מלאי אתר', 'מלאי לאתר', 'כמות אתר', 'אתר', 'מלאי אינטרנט', 'stock web'],
  stock_phone: ['מלאי טלפון', 'מלאי לטלפון', 'כמות טלפון', 'טלפון', 'מלאי טלפוני', 'stock phone'],
  phone_code:  ['קוד טלפוני', 'קוד בטלפון', 'קוד הקשה', 'קוד שלוחה', 'phone code'],
}

/**
 * נרמול כותרת להשוואה.
 *
 * ⚠️ מסיר גרשיים מכל הסוגים (״ ' " ׳), מקפים, נקודתיים ותווי כיווניות
 * בלתי נראים, ומכווץ רווחים. "מק״ט" ו-"מק'ט" ו-"מקט " הופכים לאותו דבר.
 */
export function normalizeHeader(raw: string): string {
  return String(raw ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')     // תווי כיווניות בלתי נראים
    .replace(/["'״׳`]/g, '')           // גרשיים מכל הסוגים
    .replace(/[-–—_:.]/g, ' ')         // מפרידים
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * מזהה לאיזה שדה שייכת כותרת. מחזיר null כשאינה מוכרת.
 *
 * ⚠️ ההתאמה היא *מדויקת אחרי נרמול* ולא הכלה. הכלה הייתה מתאימה
 * "מלאי טלפון" גם ל-'טלפון' וגם ל-'מלאי אתר' (שניהם מוכלים בו בחלקם),
 * והשיוך היה תלוי בסדר המפתחות באובייקט — כלומר שרירותי.
 */
export function matchHeader(raw: string): BookField | null {
  const n = normalizeHeader(raw)
  if (!n) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [BookField, string[]][]) {
    if (aliases.some(a => normalizeHeader(a) === n)) return field
  }
  return null
}

/** מיפוי אינדקס-עמודה → שדה, מתוך שורת הכותרות. */
export function mapHeaderRow(headers: string[]): Partial<Record<BookField, number>> {
  const map: Partial<Record<BookField, number>> = {}
  headers.forEach((h, i) => {
    const f = matchHeader(h)
    // ⚠️ הראשון זוכה: קובץ עם שתי עמודות "מחיר" ייקח את השמאלית ולא יתבלבל
    if (f && map[f] === undefined) map[f] = i
  })
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// פענוח שורות
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedBook {
  sku: string
  title: string
  author: string | null
  publisher: string | null
  volumes: number
  price_agorot: number
  stock_web: number
  stock_phone: number
  phone_code: number | null
}

export interface RowError {
  /** מספר השורה *בקובץ* כפי שהמשתמש רואה אותו באקסל (1-based, כולל הכותרת). */
  row: number
  messages: string[]
}

export interface ImportResult {
  books: ParsedBook[]
  errors: RowError[]
  /** שורות שדולגו כי היו ריקות לגמרי — לא שגיאה. */
  skipped: number
  /** מק"טים שחוזרים יותר מפעם אחת *בתוך הקובץ*. */
  duplicateSkus: string[]
  /** שדות חובה שלא נמצאה להם עמודה. אם מלא — אי אפשר לייבא כלל. */
  missingColumns: BookField[]
}

const REQUIRED: BookField[] = ['sku', 'title', 'price']

function cleanText(v: unknown): string {
  return String(v ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .trim()
}

/** מספר שלם אי-שלילי, או null אם הקלט פסול. ריק → ברירת המחדל. */
function parseCount(v: unknown, fallback: number): number | null {
  const s = cleanText(v).replace(/[,\s]/g, '')
  if (!s) return fallback
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * מפענח טבלה שלמה.
 *
 * @param rows שורות גולמיות, כולל שורת הכותרות הראשונה.
 *
 * 🔴 אינו נוגע במסד. הפלט מוצג למשתמש לאישור, ורק אז נכתב.
 */
export function parseBooksTable(rows: unknown[][]): ImportResult {
  const result: ImportResult = {
    books: [], errors: [], skipped: 0, duplicateSkus: [], missingColumns: [],
  }

  if (!rows.length) {
    result.missingColumns = [...REQUIRED]
    return result
  }

  const headers = (rows[0] ?? []).map(c => cleanText(c))
  const map = mapHeaderRow(headers)

  // 🔴 חוסם מוקדם: בלי מק"ט, שם ומחיר אין מה לייבא. עדיף להיעצר כאן
  // עם הודעה ברורה מאשר לייצר 400 שורות שגיאה זהות.
  result.missingColumns = REQUIRED.filter(f => map[f] === undefined)
  if (result.missingColumns.length) return result

  const seen = new Map<string, number>()   // מק"ט מנורמל → מספר השורה הראשונה

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const rowNum = i + 1                    // 1-based כמו באקסל
    const at = (f: BookField): unknown => {
      const idx = map[f]
      return idx === undefined ? undefined : row[idx]
    }

    // שורה ריקה לגמרי — מדלגים בשקט. קובץ אקסל כמעט תמיד מסתיים
    // בכמה שורות ריקות, והן אינן שגיאה של המשתמש.
    if (row.every(c => cleanText(c) === '')) { result.skipped++; continue }

    const messages: string[] = []

    const sku = cleanText(at('sku'))
    const title = cleanText(at('title'))
    if (!sku) messages.push('חסר מק"ט')
    if (!title) messages.push('חסר שם ספר')

    const price = shekelsToAgorot(cleanText(at('price')))
    if (price === null) {
      const raw = cleanText(at('price'))
      messages.push(raw ? `מחיר לא תקין: "${raw}"` : 'חסר מחיר')
    }

    const volumes = parseCount(at('volumes'), 1)
    if (volumes === null) messages.push(`מספר כרכים לא תקין: "${cleanText(at('volumes'))}"`)
    else if (volumes < 1) messages.push('מספר כרכים חייב להיות לפחות 1')

    const stockWeb = parseCount(at('stock_web'), 0)
    if (stockWeb === null) messages.push(`מלאי אתר לא תקין: "${cleanText(at('stock_web'))}"`)

    const stockPhone = parseCount(at('stock_phone'), 0)
    if (stockPhone === null) messages.push(`מלאי טלפון לא תקין: "${cleanText(at('stock_phone'))}"`)

    let phoneCode: number | null = null
    const rawCode = cleanText(at('phone_code'))
    if (rawCode) {
      const c = parseCount(rawCode, 0)
      if (c === null || c <= 0) messages.push(`קוד טלפוני לא תקין: "${rawCode}"`)
      else phoneCode = c
    }

    // ⚠️ כפילות מק"ט *בתוך הקובץ*. כפילות מול הקטלוג הקיים אינה שגיאה —
    // היא עדכון, ומטופלת בשלב הכתיבה.
    if (sku) {
      const key = sku.toLowerCase()
      const first = seen.get(key)
      if (first !== undefined) {
        messages.push(`מק"ט כפול בקובץ — מופיע גם בשורה ${first}`)
        if (!result.duplicateSkus.includes(sku)) result.duplicateSkus.push(sku)
      } else {
        seen.set(key, rowNum)
      }
    }

    if (messages.length) {
      result.errors.push({ row: rowNum, messages })
      continue
    }

    result.books.push({
      sku,
      title,
      author:      cleanText(at('author')) || null,
      publisher:   cleanText(at('publisher')) || null,
      volumes:     volumes!,
      price_agorot: price!,
      stock_web:   stockWeb!,
      stock_phone: stockPhone!,
      phone_code:  phoneCode,
    })
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// התבנית להורדה
// ─────────────────────────────────────────────────────────────────────────────

/** כותרות התבנית, לפי הסדר. */
export const TEMPLATE_HEADERS: { field: BookField; label: string; required: boolean; hint: string }[] = [
  { field: 'sku',         label: 'מק"ט',         required: true,  hint: 'מזהה ייחודי. לפיו הלקוח מאתר בטלפון ובאתר' },
  { field: 'title',       label: 'שם הספר',      required: true,  hint: 'השם שיוצג ויוקרא' },
  { field: 'author',      label: 'מחבר',         required: false, hint: 'אופציונלי' },
  { field: 'publisher',   label: 'הוצאה',        required: false, hint: 'אופציונלי' },
  { field: 'volumes',     label: 'מספר כרכים',   required: false, hint: 'ברירת מחדל 1. משמש לאריזה' },
  { field: 'price',       label: 'מחיר',         required: true,  hint: 'בשקלים, למשל 45.90' },
  { field: 'stock_web',   label: 'מלאי אתר',     required: false, hint: 'כמה עותקים למכירה באתר' },
  { field: 'stock_phone', label: 'מלאי טלפון',   required: false, hint: 'כמה עותקים למכירה בטלפון' },
  { field: 'phone_code',  label: 'קוד טלפוני',   required: false, hint: 'קוד להקשה בשלוחה. ריק = לא נמכר בטלפון' },
]

/** שורות הדוגמה בתבנית — כדי שהמשתמש יראה את הפורמט הצפוי. */
export const TEMPLATE_SAMPLE: (string | number)[][] = [
  ['1001', 'שולחן ערוך אורח חיים', 'רבי יוסף קארו', 'מכון ירושלים', 4, 180, 20, 10, 101],
  ['1002', 'משנה ברורה מהדורה חדשה', 'החפץ חיים', '', 6, 245.9, 15, 5, 102],
  ['1003', 'חומש עם רש"י', '', '', 5, 120, 30, 0, ''],
]
