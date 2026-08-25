// ─────────────────────────────────────────────────────────────────────────────
// סינון רשימת הנרשמים לחלוקה — מקור אמת יחיד.
//
// 🔴 למה זה קיים: מסך החלוקה שלף את *כל* 6,047 הנרשמים עם כל פרטי
// המשפחה (~4.8MB JSON) כדי להציג 50 שורות. המסד עצמו לוקח 25ms —
// הזמן כולו הוא העברת המטען ורינדורו. התוצאה: ~7 שניות לטעינה.
//
// ⚠️ אותם כללים חייבים לרוץ בשרת ובלקוח: הסינון עבר לשרת, אבל הלקוח
// עדיין מסנן את מה שכבר בידיו (מעבר בין עמודים בלי בקשת רשת). שני
// מימושים היו נסחפים, ואז המונה מראה מספר אחד והרשימה מספר אחר.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterState {
  /** חיפוש חופשי — שם, ת"ז, טלפון, כתובת. */
  q?: string
  /** מקור הרישום. 'all' = הכל. */
  source?: string
  /** סטטוס אישור. */
  approval?: string
  community?: string
  city?: string
  ageBucket?: string
  kidsBucket?: string
}

/** האם הסינון ריק — כלומר מציגים הכל. */
export function isEmptyFilter(f: FilterState): boolean {
  return !f.q?.trim()
    && (!f.source || f.source === 'all')
    && (!f.approval || f.approval === 'all')
    && (!f.community || f.community === 'all')
    && (!f.city || f.city === 'all')
    && (!f.ageBucket || f.ageBucket === 'all')
    && (!f.kidsBucket || f.kidsBucket === 'all')
}

/**
 * ⚠️ ערך ריק מוצג כ"לא צוין" ולא מושמט: משפחה בלי קהילה עדיין צריכה
 * להופיע בפילוח, אחרת הסכום של הקבוצות קטן מסך הכול והמנהל מחפש
 * לאן נעלמו.
 */
export const orNotSpecified = (v?: string | null) => (v ?? '').trim() || 'לא צוין'

/** קבוצות גיל — משותף לשרת וללקוח. */
export const AGE_BUCKET_DEFS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: 'all', label: 'כל הגילאים' },
  { key: 'u30', label: 'עד 30', max: 29 },
  { key: '30_39', label: '30–39', min: 30, max: 39 },
  { key: '40_49', label: '40–49', min: 40, max: 49 },
  { key: '50_59', label: '50–59', min: 50, max: 59 },
  { key: '60p', label: '60 ומעלה', min: 60 },
]

/** קבוצות ילדים. */
export const KIDS_BUCKET_DEFS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: 'all', label: 'כל המשפחות' },
  { key: '0_2', label: 'עד 2', max: 2 },
  { key: '3_5', label: '3–5', min: 3, max: 5 },
  { key: '6_8', label: '6–8', min: 6, max: 8 },
  { key: '9p', label: '9 ומעלה', min: 9 },
]

/**
 * בדיקת השתייכות לקבוצה מספרית.
 *
 * ⚠️ null אינו שייך לשום קבוצה מלבד 'all': גיל לא ידוע אינו "0", ושיוכו
 * לקבוצה הצעירה היה מנפח אותה בעשרות משפחות שאיננו יודעים עליהן דבר.
 */
export function inBucket(
  value: number | null | undefined,
  defs: { key: string; min?: number; max?: number }[],
  key: string,
): boolean {
  if (!key || key === 'all') return true
  const d = defs.find(x => x.key === key)
  if (!d) return true
  if (value == null) return false
  if (d.min != null && value < d.min) return false
  if (d.max != null && value > d.max) return false
  return true
}

/** מה שהסינון בלקוח צריך לדעת על שורה. */
export interface FilterableRow {
  id: string
  source?: string | null
  approval_status?: string | null
  community?: string | null
  city?: string | null
  age?: number | null
  children_count?: number | null
}

/**
 * סינון בצד הלקוח.
 *
 * ⚠️ `haystack` מגיע מבחוץ ואינו נבנה כאן: הוא מחושב פעם אחת לכל שורה
 * ומוחזק במטמון. בנייתו בכל הקלדה עבור 6,000 שורות היא בדיוק מה
 * שגרם לתיבת החיפוש להרגיש תקועה.
 */
export function matchesFilter(
  row: FilterableRow,
  f: FilterState,
  haystack?: string,
): boolean {
  if (f.source && f.source !== 'all' && row.source !== f.source) return false
  if (f.approval && f.approval !== 'all' && row.approval_status !== f.approval) return false
  if (f.community && f.community !== 'all' && orNotSpecified(row.community) !== f.community) return false
  if (f.city && f.city !== 'all' && orNotSpecified(row.city) !== f.city) return false
  if (!inBucket(row.age, AGE_BUCKET_DEFS, f.ageBucket ?? 'all')) return false
  if (!inBucket(row.children_count, KIDS_BUCKET_DEFS, f.kidsBucket ?? 'all')) return false

  const q = (f.q ?? '').trim().toLowerCase()
  if (!q) return true
  return (haystack ?? '').includes(q)
}

/**
 * מנקה קלט חיפוש לפני שהוא נשלח למסד.
 *
 * 🔴 ילדי PostgREST: פסיק מפריד בין תנאים ב-or(), וסוגריים סוגרים
 * את הביטוי. קלט שמכיל אותם היה מייצר שאילתה שגויה — במקרה הטוב
 * שגיאה, במקרה הרע תנאי אחר לגמרי ממה שהמשתמש ביקש.
 *
 * ⚠️ % ו-_ הם תווי חיפוש ב-ilike; מי שמחפש "50%" מתכוון לתו עצמו.
 */
export function sanitizeSearch(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/[,()]/g, ' ')
    .replace(/[%_\\]/g, m => `\\${m}`)
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}
