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
  /** סינון מתקדם — טווחי גיל/ילדים/תאריך, קהילה, מין, עץ דורות. ראו AdvFilters. */
  adv: AdvFilters
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
    adv: readAdvFilters(sp),
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
  // ⚠️ קהילה ניתנת למיון אבל *אינה* ב-FILTER_COLUMNS: היא טקסט חופשי עם
  // 1,838 ערכים שונים, ורשימת בחירה בכותרת הייתה בלתי שמישה. הסינון שלה
  // הוא ilike דרך הסינון המתקדם — ראו AdvFilters.community.
  'community_affiliation',
] as const

/** העמודות שמציעות סינון לפי ערך — קבוצת ערכים סגורה בלבד. */
export const FILTER_COLUMNS = [
  'city', 'marital_status', 'eligibility_status', 'registration_source',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// סינון מתקדם — טווחים ושדות שאינם קבוצת ערכים סגורה.
//
// 🔴 למה זה נפרד מ-colFilters: colFilters הוא "בחר מתוך רשימת ערכים" (עיר,
// סטטוס). כאן יושבים סינונים שאי אפשר להביע כרשימה — טווח גיל, טווח תאריכים,
// וקהילה שהיא טקסט חופשי עם 1,838 ערכים שונים (ראו ADV_COMMUNITY למה).
//
// 🔴 הכול רץ במסד ולא בלקוח: הדף מחזיק 50 שורות מתוך 7,196, וסינון בזיכרון
// היה מסנן את העמוד בתוך עצמו ומציג תוצאה שנראית תקינה לחלוטין ואינה.
// ─────────────────────────────────────────────────────────────────────────────

/** סינון מתקדם. כל שדה ריק/undefined = אין סינון. */
export interface AdvFilters {
  /** טווח גיל בשנים (מחושב מ-birth_date). */
  ageMin?: number
  ageMax?: number
  /** טווח מספר ילדים. */
  kidsMin?: number
  kidsMax?: number
  /** טווח תאריך הרשמה (created_at), בפורמט YYYY-MM-DD. */
  regFrom?: string
  regTo?: string
  /**
   * קהילה — חיפוש "מכיל" ולא בחירה מרשימה.
   *
   * 🔴 השדה הוא טקסט חופשי: 1,838 ערכים שונים ל-7,196 רשומות, מתוכם 1,478
   * מופיעים פעם אחת בלבד. "ויזניץ" לבדה מופיעה כ"ויזניץ", "ויזניץ מרכז",
   * "קהילת ויזניץ", "ויזניץ שיכון"... רשימת בחירה הייתה מציגה 1,838 שורות
   * ובחירת "ויזניץ" הייתה מחמיצה את כל הוואריאציות. ilike תופס את כולן.
   */
  community?: string
  /** מין: male | female. */
  gender?: string
  /** שיוך לעץ הדורות: linked = משויך · unlinked = חסר בעץ. */
  lineage?: string
}

/** גבולות שפויים — חוסמים ערך אבסורדי מה-URL לפני שהוא מגיע לשאילתה. */
const AGE_MAX = 120
const KIDS_MAX = 30

/**
 * מספר שלם בטווח, או undefined אם אינו תקין. ⚠️ הערך מגיע מה-URL.
 *
 * 🔴 בדיקת תבנית ולא parseInt לבדו: parseInt('1;drop') מחזיר 1 בשקט — הוא
 * עוצר בתו הראשון שאינו ספרה במקום לפסול את הערך. כך קלט זדוני או שבור
 * היה עובר את האימות ונראה כמו מספר תקין לחלוטין.
 */
function intIn(raw: string | null, lo: number, hi: number): number | undefined {
  if (!raw || !/^\d{1,4}$/.test(raw.trim())) return undefined
  const n = parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < lo || n > hi) return undefined
  return n
}

/**
 * תאריך YYYY-MM-DD בלבד.
 * 🔴 הערך נכנס לשאילתה — כל דבר שאינו בדיוק בתבנית הזו נזרק (fail-closed).
 */
function isoDate(raw: string | null): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
  const d = new Date(`${raw}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : raw
}

export function readAdvFilters(sp: { get(k: string): string | null }): AdvFilters {
  const out: AdvFilters = {}
  const ageMin = intIn(sp.get('age_min'), 0, AGE_MAX)
  const ageMax = intIn(sp.get('age_max'), 0, AGE_MAX)
  const kidsMin = intIn(sp.get('kids_min'), 0, KIDS_MAX)
  const kidsMax = intIn(sp.get('kids_max'), 0, KIDS_MAX)
  // ⚠️ טווח הפוך (מ-40 עד 20) מוחלף ולא נזרק: המשתמש התכוון לטווח, והחלפה
  // נותנת בדיוק את מה שהתכוון אליו במקום רשימה ריקה בלי הסבר.
  if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
    out.ageMin = ageMax; out.ageMax = ageMin
  } else { out.ageMin = ageMin; out.ageMax = ageMax }
  if (kidsMin !== undefined && kidsMax !== undefined && kidsMin > kidsMax) {
    out.kidsMin = kidsMax; out.kidsMax = kidsMin
  } else { out.kidsMin = kidsMin; out.kidsMax = kidsMax }

  const regFrom = isoDate(sp.get('reg_from'))
  const regTo = isoDate(sp.get('reg_to'))
  if (regFrom && regTo && regFrom > regTo) { out.regFrom = regTo; out.regTo = regFrom }
  else { out.regFrom = regFrom; out.regTo = regTo }

  const community = (sp.get('community') ?? '').trim()
  if (community) out.community = community.slice(0, 100)
  const gender = (sp.get('gender') ?? '').trim()
  if (gender === 'male' || gender === 'female') out.gender = gender
  const lineage = (sp.get('lineage') ?? '').trim()
  if (lineage === 'linked' || lineage === 'unlinked') out.lineage = lineage
  return out
}

/** האם יש ולו סינון מתקדם אחד פעיל. */
export function hasAdvFilters(a: AdvFilters): boolean {
  return Object.values(a).some((v) => v !== undefined && v !== '')
}

/** מפתחות ה-URL של הסינון המתקדם — מקור אמת יחיד לייצוא ולניקוי. */
export const ADV_KEYS = [
  'age_min', 'age_max', 'kids_min', 'kids_max',
  'reg_from', 'reg_to', 'community', 'gender', 'lineage',
] as const

/**
 * גיל → תאריך לידה. גיל הוא נגזרת של birth_date, ולכן הסינון מתורגם לטווח
 * תאריכים ורץ ישירות על העמודה.
 *
 * 🔴 חישוב בצד השאילתה (age(birth_date)) היה פוסל שימוש באינדקס וסורק את כל
 * הטבלה. התרגום לטווח תאריכים משאיר את הסינון "sargable".
 *
 * הגבולות: מי שגילו בדיוק ageMax עדיין נכלל — עד יום לפני יום ההולדת הבא.
 *   גיל ≥ min  ⇔  birth_date ≤ today - min שנים
 *   גיל ≤ max  ⇔  birth_date >  today - (max+1) שנים
 */
export function ageToBirthRange(
  ageMin: number | undefined,
  ageMax: number | undefined,
  today = new Date(),
): { from?: string; to?: string } {
  const shift = (years: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    d.setUTCFullYear(d.getUTCFullYear() - years)
    return d.toISOString().slice(0, 10)
  }
  const out: { from?: string; to?: string } = {}
  // גיל מקסימלי → תאריך הלידה המוקדם ביותר (הגבול התחתון של הטווח).
  if (ageMax !== undefined) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    d.setUTCFullYear(d.getUTCFullYear() - (ageMax + 1))
    d.setUTCDate(d.getUTCDate() + 1)   // כולל את מי שגילו בדיוק ageMax
    out.from = d.toISOString().slice(0, 10)
  }
  // גיל מינימלי → תאריך הלידה המאוחר ביותר (הגבול העליון).
  if (ageMin !== undefined) out.to = shift(ageMin)
  return out
}
