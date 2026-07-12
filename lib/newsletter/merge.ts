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
  { token: 'קישור_הסרה',   label: 'קישור הסרה מהתפוצה', example: '(נוצר אוטומטית)' },
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
    'קישור_הסרה': unsubscribeUrl,
  }
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
  return String(template ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, rawKey: string) => {
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

/** משתנים שנכתבו בתוכן אך אינם מוכרים — מוצגים כאזהרה במסך העריכה. */
export function unknownTags(template: string): string[] {
  const known = new Set(MERGE_TAGS.map(t => t.token))
  return extractTags(template).filter(t => !known.has(t))
}
