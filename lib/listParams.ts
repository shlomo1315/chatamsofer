// פונקציות טהורות לקריאת פרמטרי רשימה מ-URL — משותפות לשרת (page.tsx) ולקליינט
// (useListParams). אין כאן 'use client' בכוונה, כדי שהשרת יוכל לייבא בבטחה.

export const PAGE_SIZES = [20, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 50

export interface ListParams {
  page: number
  size: number
  q: string
  status: string
  sort: string
  marital: string   // סינון לפי מצב משפחתי ('all' = הכל)
  /** סינון לפי מצב המייל: all | verified | unverified | invalid */
  email: string
  // ── מיון וסינון מכותרות הטבלה (ראו lib/tableSort) ────────────────────────
  /** עמודת המיון מהכותרת. ריק = מיון ברירת המחדל של sort. */
  col: string
  /** כיוון המיון של col. */
  dir: 'asc' | 'desc'
  /**
   * סינון לפי ערכים, לכל עמודה.
   *
   * 🔴 חייב לרוץ במסד: הדף מחזיק 50 שורות מתוך 7,066, וסינון בצד הלקוח
   * היה מציג תוצאה שנראית תקינה לחלוטין ואינה. ראו SortFilterOpts.
   *
   * בקידוד ב-URL: `f=city:ירושלים|ערד;marital_status:אלמן`
   */
  colFilters: Record<string, string[]>
}

/**
 * פיענוח `f=col:v1|v2;col2:v3` — ראו colFilters.
 *
 * 🔴 שם העמודה מגיע מה-URL ומשמש כשם עמודה בשאילתה. בדיקת תווים לבדה
 * אינה מספיקה: המחרוזת `city);drop:x` מתפצלת ב-`;` ל-`city)` (נפסל)
 * ול-`drop:x` — ו-`drop` הוא מזהה תקין לחלוטין שעובר את הבדיקה.
 * לכן ההגנה האמיתית היא allowlist: רק עמודות שהטבלה עצמה הכריזה עליהן.
 * הקורא *חייב* להעביר allow; בלעדיו לא מוחזר דבר.
 */
export function parseColFilters(
  raw: string | null,
  allow?: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (!raw) return out
  // ⚠️ בלי רשימת היתר אין סינון כלל — fail-closed. פרמטר שנשכח לא
  // אמור להפוך שם עמודה מה-URL לשאילתה.
  const allowed = allow ? new Set(allow) : null
  for (const part of raw.split(';')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const key = part.slice(0, i).trim()
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) continue
    if (!allowed || !allowed.has(key)) continue
    const values = part.slice(i + 1).split('|').map(decodeURIComponent).filter(Boolean)
    if (values.length) out[key] = values
  }
  return out
}

/** קידוד חזרה ל-URL. ריק → מחרוזת ריקה (הפרמטר יוסר). */
export function encodeColFilters(f: Record<string, string[]>): string {
  return Object.entries(f)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k}:${v.map(encodeURIComponent).join('|')}`)
    .join(';')
}

export function readListParams(
  sp: URLSearchParams | { get(k: string): string | null },
  opts?: {
    defaultStatus?: string
    defaultSort?: string
    /**
     * העמודות שמותר למיין ולסנן לפיהן.
     *
     * 🔴 fail-closed: בלעדיה col ו-colFilters נשארים ריקים. שם עמודה
     * מה-URL לא אמור להגיע לשאילתה רק משום שהוא נראה כמו מזהה תקין.
     */
    sortCols?: readonly string[]
  },
): ListParams {
  const allow = opts?.sortCols
  const rawCol = (sp.get('col') ?? '').trim()
  const rawSize = parseInt(sp.get('size') ?? '', 10)
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE
  const rawPage = parseInt(sp.get('page') ?? '', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  return {
    page,
    size,
    q: (sp.get('q') ?? '').trim(),
    status: sp.get('status') ?? opts?.defaultStatus ?? 'all',
    sort: sp.get('sort') ?? opts?.defaultSort ?? 'newest',
    marital: (sp.get('marital') ?? 'all').trim() || 'all',
    email: (sp.get('email') ?? 'all').trim() || 'all',
    // ⚠️ allowlist ולא בדיקת תווים — ראו ההערה ב-parseColFilters.
    col: allow?.includes(rawCol) ? rawCol : '',
    dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    colFilters: parseColFilters(sp.get('f'), allow),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מיון וסינון מכותרות טבלת הצאצאים.
//
// 🔴 כאן ולא ב-beneficiariesList: הקובץ ההוא מייבא את lib/supabase/server,
// וייבוא הקבועים ממנו לתוך קומפוננטת לקוח גורר את קליינט השרת אל באנדל
// הדפדפן ומפיל את הבנייה. הקובץ הזה טהור בכוונה — ראו ההערה בראשו.
//
// 🔴 רשימת ההיתר היא ההגנה: שם העמודה מגיע מה-URL ומשמש כשם עמודה
// בשאילתה. בדיקת תווים לבדה אינה מספיקה — 'city);drop:x' מתפצל ב-';'
// ל-'drop:x', ו-'drop' הוא מזהה תקין. ראו listParams.test.ts.
//
// ⚠️ רק עמודות אמיתיות בטבלה. עמודה מחושבת (approval_label) אינה כאן:
// אי אפשר למיין לפיה במסד, ומיון בצד הלקוח היה ממיין את הדף בלבד.
// ─────────────────────────────────────────────────────────────────────────────
export const SORT_COLUMNS = [
  'full_name', 'family_name', 'id_number', 'spouse_name', 'city',
  'marital_status', 'children_count', 'eligibility_status',
  'registration_source', 'created_at', 'email', 'phone',
] as const

/** העמודות שמציעות סינון לפי ערך — קבוצת ערכים סגורה בלבד. */
export const FILTER_COLUMNS = [
  'city', 'marital_status', 'eligibility_status', 'registration_source',
] as const
