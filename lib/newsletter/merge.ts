import { greetByStatus } from '../emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// מנוע משתני מיזוג — עובד גם בשורת הנושא וגם בגוף המייל.
//
// הערכים נלקחים מסנאפשוט (merge_data) שנשמר בזמן מימוש הסגמנט, ולא מה-DB
// בזמן השליחה — כך הקמפיין עקבי גם אם רשומה משתנה או נמחקת באמצע.
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeSource {
  family_name?: string | null
  full_name?: string | null
  spouse_name?: string | null
  marital_status?: string | null
  city?: string | null
  address?: string | null
  phone?: string | null
  phone2?: string | null
  children_count?: number | null
  email?: string | null
  id_number?: string | null
  // ── מוקד החלוקה — נשלף בזמן מימוש הסגמנט (ראו segments.ts) ──
  center_name?: string | null
  center_city?: string | null
  center_address?: string | null
  center_hours?: string | null
  /** האם המוקד כבר החל לחלק (holiday_center_openings.pickup_open_at). */
  center_pickup_open?: boolean | null
  [key: string]: unknown
}

export interface MergeTag {
  token: string        // כפי שנכתב בתוכן: {{שם_משפחה}}
  label: string        // תווית לבורר במסך העריכה
  example: string      // דוגמה שמוצגת למשתמש
}

export const MERGE_TAGS: MergeTag[] = [
  { token: 'פנייה',        label: 'פנייה מכובדת (חכם)', example: 'שלום וברכה, הרב כהן הי״ו,' },
  { token: 'שם_משפחה',     label: 'שם משפחה',           example: 'כהן' },
  { token: 'שם_פרטי',      label: 'שם פרטי',            example: 'משה' },
  { token: 'שם_מלא',       label: 'שם מלא',             example: 'משה כהן' },
  { token: 'שם_האשה',      label: 'שם האשה',            example: 'שרה' },
  { token: 'עיר',          label: 'עיר',                example: 'בני ברק' },
  { token: 'כתובת',        label: 'כתובת',              example: 'רחוב הרב קוק 12' },
  { token: 'טלפון',        label: 'טלפון',              example: '050-1234567' },
  { token: 'מייל',         label: 'כתובת מייל',         example: 'moshe@example.com' },
  { token: 'תעודת_זהות',   label: 'תעודת זהות',         example: '123456789' },
  { token: 'מספר_ילדים',   label: 'מספר ילדים',         example: '7' },
  // ── מוקד החלוקה של המשפחה ──
  // 🔴 כל משפחה מקבלת את המוקד *שלה*. בלי זה אי אפשר לשלוח מייל אחד
  // ל-6,106 משפחות: הכתובת והשעות שונות בין 26 המוקדים, ומשפחה שקיבלה
  // כתובת של מוקד אחר מגיעה למקום הלא נכון.
  { token: 'מוקד',         label: 'מוקד החלוקה',        example: 'בני ברק, אזור סקולוב' },
  { token: 'מוקד_עיר',     label: 'עיר המוקד',          example: 'בני ברק' },
  { token: 'מוקד_כתובת',   label: 'כתובת המוקד',        example: 'יואל 6 קומה 2' },
  { token: 'מוקד_שעות',    label: 'ימי ושעות הקבלה',    example: 'ימי רביעי וחמישי, 16:00–23:00' },
  { token: 'מוקד_סטטוס',   label: 'מצב המוקד',          example: 'מחלק' },
  { token: 'קישור_הסרה',   label: 'קישור הסרה מהתפוצה', example: '(נוצר אוטומטית)' },
]

// ─────────────────────────────────────────────────────────────────────────────
// בלוקים מותנים — פסקה שלמה שמופיעה רק לחלק מהנמענים.
//
// 🔴 שדה סטטוס לבדו אינו מספיק: המנהל צריך לכתוב *פסקאות שונות* לשני
// המצבים — "הכרטיס ממתין, הנה הכתובת והשעות" מול "נעדכן כשהמוקד ייפתח".
// בלי זה הוא נאלץ לשלוח שני קמפיינים ולסנן ידנית, וטעות בסינון שולחת
// משפחה לדלת נעולה.
// ─────────────────────────────────────────────────────────────────────────────
export interface ConditionalBlock {
  /** {{#שם}} ... {{/שם}} */
  name: string
  label: string
  /** הבלוק נשאר כשהתנאי מתקיים על מפת הערכים. */
  test: (data: Record<string, string>) => boolean
}

export const CONDITIONAL_BLOCKS: ConditionalBlock[] = [
  {
    name: 'אם_מוקד_מחלק',
    label: 'רק למי שהמוקד שלו כבר מחלק',
    test: d => d['מוקד_סטטוס'] === 'מחלק',
  },
  {
    name: 'אם_מוקד_טרם_מחלק',
    label: 'רק למי שהמוקד שלו טרם החל לחלק',
    test: d => d['מוקד_סטטוס'] === 'טרם מחלק',
  },
]

// ברירות מחדל — אף פעם לא משאירים {{משתנה}} ריק במייל שיוצא ללקוח
const FALLBACKS: Record<string, string> = {
  'פנייה': 'שלום וברכה,',
  'שם_משפחה': 'ידידנו',
  'שם_פרטי': '',
  'שם_מלא': 'ידידנו היקר',
  'שם_האשה': '',
  'עיר': '',
  'כתובת': '',
  'טלפון': '',
  'מייל': '',
  'תעודת_זהות': '',
  'מספר_ילדים': '',
  // ⚠️ ריק ולא "המוקד שלכם": משפחה שטרם בחרה מוקד תקבל משפט חסר במקום
  // טקסט שמתחזה למידע.
  'מוקד': '',
  'מוקד_עיר': '',
  'מוקד_כתובת': '',
  'מוקד_שעות': '',
  'מוקד_סטטוס': '',
  'קישור_הסרה': '',
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * בונה את מפת הערכים לנמען יחיד.
 * זהו הסנאפשוט שנשמר ב-campaign_recipients.merge_data.
 */
export function buildMergeData(src: MergeSource, unsubscribeUrl = ''): Record<string, string> {
  const family = (src.family_name ?? '').trim()
  const first = (src.full_name ?? '').trim()
  const wife = (src.spouse_name ?? '').trim()

  return {
    // greetByStatus כבר יודע להבחין בין אברך לאלמנה — מחזיר HTML מנוטרל
    'פנייה': greetByStatus(family, first, src.marital_status),
    'שם_משפחה': family,
    'שם_פרטי': first,
    'שם_מלא': [family, first].filter(Boolean).join(' '),
    'שם_האשה': wife,
    'עיר': (src.city ?? '').trim(),
    'כתובת': (src.address ?? '').trim(),
    // הטלפון הראשי, ובנפילה — הטלפון הנוסף
    'טלפון': ((src.phone ?? '').trim() || (src.phone2 ?? '').trim()),
    'מייל': (src.email ?? '').trim(),
    'תעודת_זהות': (src.id_number ?? '').trim(),
    'מספר_ילדים': src.children_count != null ? String(src.children_count) : '',
    // ── מוקד החלוקה ──
    // ⚠️ אותה הרכבה כמו בטלפון ובשובר (spokenCenterName): עיר ששמה זהה
    // לשם המוקד אינה נאמרת פעמיים.
    'מוקד': centerLabel(src),
    'מוקד_עיר': (src.center_city ?? '').trim(),
    'מוקד_כתובת': (src.center_address ?? '').trim(),
    'מוקד_שעות': (src.center_hours ?? '').trim(),
    // ⚠️ ריק כשאין מוקד כלל — כדי ששני הבלוקים המותנים לא יתפסו אותו.
    'מוקד_סטטוס': centerLabel(src)
      ? (src.center_pickup_open ? 'מחלק' : 'טרם מחלק')
      : '',
    'קישור_הסרה': unsubscribeUrl,
  }
}

/** שם המוקד לתצוגה — עיר ושם, בלי כפילות. */
function centerLabel(src: MergeSource): string {
  const city = (src.center_city ?? '').trim()
  const name = (src.center_name ?? '').trim()
  if (city && name && city !== name) return `${city}, ${name}`
  return name || city || ''
}

/**
 * מזריק את המשתנים לתוך תבנית.
 *
 * @param html כשtrue — הערכים מנוטרלים (escaped) לפני ההזרקה.
 *             חובה לגוף המייל. לשורת הנושא — false (טקסט רגיל).
 */
export function applyMerge(
  template: string,
  data: Record<string, string>,
  html = true,
): string {
  // ── שלב א': בלוקים מותנים ──
  // 🔴 קודם לכל, ולפני הזרקת המשתנים: משתנים בתוך בלוק שיורד אינם צריכים
  // להיות מוזרקים כלל, ובלוק שנשאר מוזרק בהמשך כמו כל טקסט אחר.
  //
  // ⚠️ הסרה ולא השארה ריקה — שרידי {{#...}} במייל שיוצא ללקוח נראים כתקלה.
  let out = String(template ?? '')
  for (const block of CONDITIONAL_BLOCKS) {
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 העטיפה נבלעת יחד עם התג.
    //
    // ⚠️ העורך (contentEditable) עוטף כל שורה, ולכן התג לעולם אינו עומד
    // לבדו אלא כ-<div>{{#שם}}</div>. ביטוי שחיפש את התג בלבד לא התאים,
    // ו*שתי* הפסקאות נשלחו לכל הנמענים — משפחה שהמוקד שלה סגור קיבלה
    // "המוקד פתוח כעת לחלוקה" עם כתובת ריקה.
    //
    // ⚠️ העטיפה נבלעת ולא רק התג: השארתה מותירה <div></div> ריק, כלומר
    // שורה ריקה מיותרת באמצע המייל.
    // ⚠️ [\s\S] ולא . — הבלוק משתרע על פני שורות.
    // ─────────────────────────────────────────────────────────────────────
    const open = `(?:<(?:div|p)[^>]*>\\s*)?\\{\\{\\s*#\\s*${block.name}\\s*\\}\\}(?:\\s*</(?:div|p)>)?`
    const close = `(?:<(?:div|p)[^>]*>\\s*)?\\{\\{\\s*/\\s*${block.name}\\s*\\}\\}(?:\\s*</(?:div|p)>)?`
    const re = new RegExp(`${open}([\\s\\S]*?)${close}`, 'g')
    out = out.replace(re, (_m, body: string) => (block.test(data) ? body : ''))
  }

  return out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, rawKey: string) => {
    const key = rawKey.trim()
    const raw = data[key] ?? FALLBACKS[key] ?? ''

    // 'פנייה' כבר מגיע כ-HTML מנוטרל מ-greetByStatus — לא לנטרל פעמיים
    if (key === 'פנייה') return raw
    // קישור הסרה נכנס לתוך href — לא לנטרל
    if (key === 'קישור_הסרה') return raw

    return html ? escapeHtml(raw) : String(raw)
  })
}

/** מחלץ את שמות המשתנים שבשימוש בתבנית — לאימות לפני שליחה. */
export function extractTags(template: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(template ?? ''))) !== null) out.add(m[1].trim())
  return [...out]
}

/**
 * משתנים שנכתבו בתוכן אך אינם מוכרים — מוצגים כאזהרה במסך העריכה.
 *
 * ⚠️ תחביר הבלוקים ({{#שם}} / {{/שם}}) אינו משתנה: בלעדי הסינון הזה כל
 * בלוק מותנה היה מסומן למנהל כשגיאה, והוא היה מוחק אותו.
 */
export function unknownTags(template: string): string[] {
  const known = new Set(MERGE_TAGS.map(t => t.token))
  const blocks = new Set(CONDITIONAL_BLOCKS.map(b => b.name))
  return extractTags(template).filter(t => {
    const bare = t.replace(/^[#/]\s*/, '').trim()
    if (bare !== t && blocks.has(bare)) return false
    return !known.has(t)
  })
}
