// שליפת רשימת הצאצאים/החריגים — לוגיקה משותפת לדף הצאצאים הראשי ולדף
// "אישורים חריגים". שניהם משתמשים באותה טבלה ובאותם מסכי פרטים; ההבדל היחיד
// הוא סינון is_special (הרשימה הראשית מסתירה חריגים; דף החריגים מציג רק אותם).

import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Beneficiary } from '@/types'
import type { readListParams } from '@/lib/listParams'
import { BLANK } from '@/lib/tableSort'
import { SORT_COLUMNS, FILTER_COLUMNS } from '@/lib/listParams'

// רק העמודות שטבלת הרשימה מציגה/ממיינת/מחפשת בהן — משמיט שדות כבדים (children JSON,
// lineage_chain, lineage_manual וכו') מה-payload. כרטיס המוטב וייצוא האקסל מושכים בנפרד.
export const LIST_COLUMNS =
  'id, created_at, full_name, family_name, id_number, phone, phone2, email, address, city, ' +
  'marital_status, spouse_name, spouse_id_number, nedarim_id, notes, children_count, eligibility_status, is_active, registration_source, approval_label:approval_labels(id, name, color, notes)'

// כרטיסי הסטטוס שהטבלה מציגה — ה-counts נשלפים לכל אחד בנפרד מ-DB.
export const STATUS_KEYS = ['pending', 'docs_pending', 'docs_returned', 'deep_review', 'approved', 'rejected', 'review'] as const

// ─────────────────────────────────────────────────────────────────────────────
// "ממתין לאישור ראשוני" = כל מה שעדיין לא הוכרע.
//
// ⚠️ מעגל התיקונים (השלמת מסמכים / הוחזרו תיקונים) הוא *מצב ביניים של המתנה*,
// ולא סטטוס משלו מבחינת הכרטסת. כשכרטיסי מעגל התיקונים הוסרו ממסך הצאצאים,
// הרשומות האלה לא נספרו באף כרטיס — סך הכול היה 119 וסכום הכרטיסים 109, כלומר
// 10 משפחות שנעלמו מהעין. הקיבוץ מחזיר אותן ל"ממתין לאישור ראשוני": גם הספירה
// וגם הסינון בלחיצה. הסטטוס המדויק של כל שורה ממשיך להופיע בתג שלה בטבלה.
//
// review — סטטוס היסטורי שנשאר בנתונים; נספר גם הוא כהמתנה ולא נופל בין הכיסאות.
// ─────────────────────────────────────────────────────────────────────────────
const PENDING_GROUP = ['pending', 'docs_pending', 'docs_returned', 'review']
// eligibility_status ריק (רשומות ותיקות) — גם הוא המתנה, אחרת הוא לא נספר כלל
const PENDING_OR = `eligibility_status.in.(${PENDING_GROUP.join(',')}),eligibility_status.is.null`

// עמודות שהחיפוש החופשי מכסה (ilike). trigram indexes קיימים על שם/טלפון.
const SEARCH_COLUMNS = [
  'full_name', 'family_name', 'id_number', 'phone', 'phone2', 'email',
  'address', 'city', 'marital_status', 'spouse_name', 'spouse_id_number', 'nedarim_id',
]

function escapeOr(v: string) {
  // ב-.or() של PostgREST פסיק/סוגריים הם תוחמים — מנטרלים אותם מקלט המשתמש.
  return v.replace(/[,()]/g, ' ')
}

const searchOr = (term: string) =>
  SEARCH_COLUMNS.map((c) => `${c}.ilike.%${escapeOr(term)}%`).join(',')


/**
 * אפשרויות הסינון לכל עמודה — ערך + מונה, מכל המאגר.
 *
 * ⚠️ RPC אחד במעבר יחיד (beneficiaries_filter_options). ארבע שאילתות
 * distinct נפרדות היו סורקות את הטבלה הגדולה במערכת ארבע פעמים בכל
 * טעינת דף.
 *
 * כשל אינו מפיל את הדף: בלי אפשרויות פשוט אין סינון לפי ערך, והטבלה
 * ממשיכה לעבוד.
 */
async function getFilterOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  special: boolean,
): Promise<Record<string, { value: string; count: number }[]>> {
  const out: Record<string, { value: string; count: number }[]> = {}
  try {
    const { data, error } = await supabase.rpc('beneficiaries_filter_options', { only_special: special })
    if (error || !Array.isArray(data)) {
      if (error) console.error('[beneficiaries] filter_options RPC נכשל:', error.message)
      return out
    }
    for (const r of data as { col: string; value: string; cnt: number | string }[]) {
      (out[r.col] ??= []).push({ value: r.value, count: Number(r.cnt) })
    }
    // ⚠️ ממוין לפי שכיחות — ברשימה של 75 ערים, מה שמחפשים בראש.
    // הריק תמיד אחרון. אותו כלל כמו distinctValues ב-lib/tableSort.
    for (const list of Object.values(out)) {
      list.sort((a, b) => {
        if (a.value === BLANK) return 1
        if (b.value === BLANK) return -1
        if (b.count !== a.count) return b.count - a.count
        return a.value.localeCompare(b.value, 'he', { numeric: true })
      })
    }
  } catch (e) {
    console.error('[beneficiaries] filter_options נכשל:', e)
  }
  return out
}

/** החלת סינון הערכים על שאילתה. ⚠️ המפתחות כבר עברו allowlist. */
function applyColFilters<T extends { in: (c: string, v: string[]) => T; or: (f: string) => T }>(
  q: T,
  filters: Record<string, string[]>,
): T {
  for (const [col, values] of Object.entries(filters)) {
    if (!FILTER_COLUMNS.includes(col as typeof FILTER_COLUMNS[number])) continue
    if (!values.length) continue
    // ⚠️ "(ריק)" הוא ערך לגיטימי לסינון — משפחה בלי עיר היא בדיוק מה
    // שהמזכירה מחפשת. הוא מתורגם ל-is.null ולא נזרק.
    const hasBlank = values.includes(BLANK)
    const real = values.filter(v => v !== BLANK)
    if (hasBlank && real.length) {
      q = q.or(`${col}.is.null,${col}.eq.,${col}.in.(${real.map(escapeOr).join(',')})`)
    } else if (hasBlank) {
      q = q.or(`${col}.is.null,${col}.eq.`)
    } else {
      q = q.in(col, real)
    }
  }
  return q
}

export { SORT_COLUMNS, FILTER_COLUMNS } from '@/lib/listParams'

export interface ListResult {
  rows: Beneficiary[]
  total: number
  counts: Record<string, number>
  /**
   * אפשרויות הסינון לכותרות — ערך + מונה, מכל המאגר.
   * ⚠️ לא מהשורות שבדף: הן 50 מתוך 7,066.
   */
  filterOptions: Record<string, { value: string; count: number }[]>
}

// בדיקה חד-פעמית לכל תהליך: האם עמודת is_special קיימת. סכימה אינה משתנה
// בזמן ריצה, ולכן אין טעם לשלם על שאילתת בדיקה בכל טעינת דף. התוצאה נשמרת
// כ-Promise כדי שגם בקשות מקבילות בעלייה הראשונה יחלקו שאילתה אחת.
let specialColProbe: Promise<boolean> | null = null
function hasSpecialColumn(supabase: { from: (t: string) => { select: (c: string) => { limit: (n: number) => PromiseLike<{ error: unknown }> } } }) {
  specialColProbe ??= (async () => {
    const { error } = await supabase.from('beneficiaries').select('is_special').limit(1)
    return !error
  })()
  return specialColProbe
}

// ─────────────────────────────────────────────────────────────────────────────
// ספירות כרטיסי הסטטוס — שאילתה אחת במקום שמונה.
//
// ⚠️ הכרטיסים אינם חלוקה זרה, וזו הנקודה הקריטית: 'pending' *כולל* את
// docs_pending/docs_returned/review, וכל אחד מהם נספר גם בכרטיס שלו עצמו
// (וגם all סופר את כולם). לכן ה-RPC מחזיר ספירה *גולמית* לכל סטטוס, והקיבוץ
// נעשה כאן. GROUP BY שהיה מחזיר ישירות את הכרטיסים היה נותן חלוקה זרה —
// כלומר מספרים אחרים מאלה שהמסך מציג היום.
// ─────────────────────────────────────────────────────────────────────────────
// הזקיף שה-RPC מחזיר עבור eligibility_status שהוא NULL. ⚠️ חייב להישאר זהה
// לזה שבמיגרציה 20260809_beneficiaries_counts_rpc.sql.
const NULL_STATUS = '__null__'

function bucketsFromRaw(raw: Map<string, number>): Record<string, number> {
  const counts: Record<string, number> = { all: 0 }
  for (const k of STATUS_KEYS) counts[k] = 0
  for (const [status, n] of raw) {
    counts.all += n
    // ⚠️ NULL (רשומות ותיקות) נופל ל'ממתין' בלבד ואין לו כרטיס משלו — בדיוק כמו
    // eligibility_status.is.null ב-PENDING_OR. לעומתו סטטוס לא-מוכר (או מחרוזת
    // ריקה) נספר ב-all בלבד: גם קודם אף .eq() לא תפס אותו ו-is.null לא חל עליו.
    if (status === NULL_STATUS) { counts.pending += n; continue }
    // הכרטיס של הסטטוס עצמו.
    if (status in counts) counts[status] += n
    // ⚠️ ובנוסף לכרטיס 'ממתין', *אלא אם* הסטטוס הוא 'pending' עצמו — הוא כבר
    // נספר בשורה הקודמת, וספירה כפולה כאן ניפחה את הכרטיס.
    if (status !== 'pending' && (PENDING_GROUP as readonly string[]).includes(status)) counts.pending += n
  }
  return counts
}

// ⚠️ הנפילה-לאחור אינה קישוט: המיגרציות כאן מורצות ידנית, ולכן יש חלון שבו הקוד
// כבר בפרודקשן וה-RPC עדיין לא קיים. בלי מסלול חלופי המסך היה מציג אפסים בכל
// הכרטיסים. הבדיקה נשמרת ברמת המודול כדי לא לשלם על ניסיון כושל בכל טעינת דף.
let countsRpcMissing = false

type CountsCtx = {
  special: boolean
  hasSpecialCol: boolean
  maritalValues: string[]
  q: string
  applySpecial: <T extends { eq: (c: string, v: unknown) => T; or: (f: string) => T }>(q: T) => T
}

async function getStatusCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: CountsCtx,
): Promise<Record<string, number>> {
  // ⚠️ אם עמודת is_special עדיין לא קיימת, ה-RPC (שמסנן עליה תמיד) אינו יכול
  // לשחזר את ההתנהגות הקיימת — שם "אין עמודה" פירושו *בלי סינון כלל*. מקרה קצה
  // תיאורטי (המיגרציה רצה מזמן), אבל הנפילה-לאחור זולה מספירה שגויה.
  if (!countsRpcMissing && ctx.hasSpecialCol) {
    try {
      const { data, error } = await supabase.rpc('beneficiaries_status_counts', {
        p_special: ctx.special,
        // ⚠️ null ולא מערך ריק — ה-RPC מבדיל בין "בלי סינון" ל"סינון לרשימה ריקה".
        p_marital: ctx.maritalValues.length ? ctx.maritalValues : null,
        p_q: ctx.q || null,
      })
      if (!error && data) {
        const rows = data as { status: string | null; cnt: number | string }[]
        // r.status לעולם אינו null (ה-RPC ממיר ל-NULL_STATUS) — ה-?? הוא רק חגורת ביטחון.
        return bucketsFromRaw(new Map(rows.map((r) => [r.status ?? NULL_STATUS, Number(r.cnt) || 0])))
      }
      // PGRST202 = הפונקציה אינה קיימת בסכימה. כל שגיאה אחרת היא תקלת ריצה
      // חולפת ואין סיבה לוותר בגללה על ה-RPC לשארית חיי התהליך.
      if (error?.code === 'PGRST202') {
        countsRpcMissing = true
        console.error('[beneficiaries] RPC beneficiaries_status_counts חסר — נופל ל-8 ספירות. יש להריץ את המיגרציה 20260809_beneficiaries_counts_rpc.sql')
      } else if (error) {
        console.error('[beneficiaries] counts RPC failed:', error.message)
      }
    } catch (e) {
      console.error('[beneficiaries] counts RPC threw:', e)
    }
  }

  // ── מסלול חלופי: השיטה הישנה, שמונה ספירות במקביל. ──
  const countFor = async (status: string): Promise<[string, number]> => {
    try {
      let q = supabase.from('beneficiaries').select('id', { count: 'exact', head: true })
      q = ctx.applySpecial(q)
      if (status === 'pending') q = q.or(PENDING_OR)
      else if (status !== 'all') q = q.eq('eligibility_status', status)
      if (ctx.maritalValues.length) q = q.in('marital_status', ctx.maritalValues)
      if (ctx.q) q = q.or(searchOr(ctx.q))
      const { count: c, error: cErr } = await q
      if (cErr) { console.error(`[beneficiaries] count(${status}) failed:`, cErr.message); return [status, 0] }
      return [status, c ?? 0]
    } catch { return [status, 0] }
  }
  const countPairs = await Promise.all(['all', ...STATUS_KEYS].map(countFor))
  return Object.fromEntries(countPairs) as Record<string, number>
}

// special: true = דף האישורים החריגים (is_special=true); false = הרשימה
// הראשית (הצאצאים הרגילים, is_special=false/null — החריגים לא מופיעים שם).
export async function getBeneficiaries(p: ReturnType<typeof readListParams>, special = false): Promise<ListResult> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, counts: { all: 0 }, filterOptions: {} }
  const supabase = await createClient()

  const ascending = p.sort === 'oldest' || p.sort === 'alpha'
  const orderCol = p.sort === 'alpha' ? 'family_name' : 'created_at'
  const from = Math.max(0, (p.page - 1) * p.size)
  const to = from + p.size - 1

  // מצב משפחתי — רב-ברירה: p.marital מגיע כרשימה מופרדת בפסיקים ('אלמן,אלמנה').
  // 'all' או ריק → אין סינון. מסננים ב-.in().
  const maritalValues = p.marital && p.marital !== 'all'
    ? p.marital.split(',').map(s => s.trim()).filter(Boolean)
    : []

  // ⚠️ בעבר נבדק כאן בכל טעינת דף אם העמודה is_special קיימת — שאילתת בדיקה
  // *חוסמת* שכל שאר השאילתות המתינו לה. המיגרציה 20260728_special_approvals
  // כבר רצה מזמן, והבדיקה נשמרת עכשיו במטמון ברמת המודול: היא רצה פעם אחת
  // לכל תהליך במקום פעם אחת לכל צפייה בדף.
  const hasSpecialCol = await hasSpecialColumn(supabase)

  // סינון החריגים: הרשימה הראשית מציגה רק לא-חריגים; דף החריגים רק חריגים.
  // בהרשמה הראשית תופסים גם null (תאימות לפני שהעמודה קיבלה ערך). אם העמודה
  // עדיין לא קיימת — לא מסננים כלל (הרשימה הראשית תציג הכל עד שהמיגרציה תרוץ).
  const applySpecial = <T extends { eq: (c: string, v: unknown) => T; or: (f: string) => T }>(q: T): T => {
    if (!hasSpecialCol) return q
    return special ? q.eq('is_special', true) : q.or('is_special.is.null,is_special.eq.false')
  }

// ── סינון לפי מצב המייל ──
//
// הרקע: נרשמים רבים (בעיקר דרך נדרים) הקלידו כתובת שגויה, וכל מייל אליהם
// נופל — כולל שובר החלוקה. הסינון מאפשר לאתר אותם ולטפל.
//
// ⚠️ "פגום" נבדק ב-SQL ולא בקוד: סינון בזיכרון היה עובד רק על העמוד
// הנוכחי (50 שורות), והמונה "מתוך N" היה משקר.
//
// ⚠️ הבדיקה גסה במכוון — היעדר @ או נקודה בדומיין. כתובת שעוברת אותה
// עדיין יכולה להיות שגויה (שם שאינו קיים), וזה בדיוק מה שאי אפשר לזהות
// בשאילתה. ראו lib/emailDomainFix לזיהוי שגיאות הכתיב בדומיין.
type EmailFilterQ = { is: (c: string, v: null) => EmailFilterQ; not: (c: string, o: string, v: null) => EmailFilterQ; or: (f: string) => EmailFilterQ; neq: (c: string, v: string) => EmailFilterQ }
function applyEmailFilter<T extends EmailFilterQ>(q: T, mode: string): T {
  switch (mode) {
    case 'verified':
      return q.not('email_verified_at', 'is', null) as T
    case 'unverified':
      // ⚠️ רק מי שיש לו כתובת בכלל — מי שאין לו מייל אינו "לא מאומת",
      // הוא פשוט לא רלוונטי לטיפול הזה.
      return q.is('email_verified_at', null).not('email', 'is', null).neq('email', '') as T
    case 'invalid':
      return q.not('email', 'is', null).neq('email', '')
        .or('email.not.like.%@%,email.not.like.%.%') as T
    case 'no_email':
      return q.or('email.is.null,email.eq.') as T
    default:
      return q
  }
}

  // ⚠️ מוחל גם על שאילתת הספירה וגם על שאילתת הנתונים: מונה שאינו
  // מכיר את הסינון היה מציג "1 מתוך 7,066" על טבלה מסוננת.

  // ── שאילתת הנתונים (עמוד אחד). סדר נכון: פילטרים (eq/or) קודם, ואז order+range. ──
  let dataQ = supabase.from('beneficiaries').select(LIST_COLUMNS)
  dataQ = applySpecial(dataQ)
  if (p.status === 'pending') dataQ = dataQ.or(PENDING_OR)
  else if (p.status !== 'all') dataQ = dataQ.eq('eligibility_status', p.status)
  if (maritalValues.length) dataQ = dataQ.in('marital_status', maritalValues)
  if (p.email && p.email !== 'all') dataQ = applyEmailFilter(dataQ, p.email)
  if (p.q) dataQ = dataQ.or(searchOr(p.q))
  dataQ = applyColFilters(dataQ, p.colFilters)

  // 🔴 המיון מהכותרת גובר על מיון ברירת המחדל, ורץ *במסד*: הדף מחזיק
  // 50 שורות מתוך 7,066, ומיון בצד הלקוח היה ממיין את הדף בתוך עצמו
  // ומציג סדר שנראה נכון לחלוטין ואינו.
  //
  // ⚠️ p.col עבר allowlist ב-readListParams — ראו SORT_COLUMNS.
  const headSort = p.col
    ? { col: p.col, asc: p.dir === 'asc' }
    : { col: orderCol, asc: ascending }

  const { data, error } = await dataQ
    .order(headSort.col, { ascending: headSort.asc, nullsFirst: false })
    // ⚠️ מיון משני יציב: בלי מפתח ייחודי שני, שורות בעלות אותו ערך
    // (6,903 נשואים!) מסודרות אחרת בכל שאילתה — ואותה משפחה מופיעה
    // בשני עמודים או נעלמת לגמרי בין דף לדף.
    .order('id', { ascending: true })
    .range(from, to)
  if (error) {
    console.error('[beneficiaries] data query failed:', JSON.stringify(error), 'params:', JSON.stringify(p))
    throw new Error(`שאילתת נתמכים נכשלה: ${error.message}`)
  }

  // ── ספירות לכרטיסים (וגם total) ─────────────────────────────────────────────
  // ⚠️ בעבר רצו כאן שמונה שאילתות count:'exact' נפרדות (all + 7 סטטוסים) בכל
  // טעינת דף *ובכל לחיצה על פילטר*. count:'exact' אינו מונה שמור אלא סריקה
  // בפועל, ולכן כל צפייה במסך סרקה את הטבלה הגדולה במערכת שמונה פעמים — עם
  // בדיוק אותם פילטרים, ורק ממד הסטטוס שונה. עכשיו RPC אחד מקבץ במעבר יחיד.
  //
  // כשל בספירה אינו מפיל את הדף — נופל ל-0 (הרשימה עצמה חשובה יותר).
  const counts = await getStatusCounts(supabase, { special, hasSpecialCol, maritalValues, q: p.q, applySpecial })

  // total = ספירת הפילטר הפעיל (all אם אין סטטוס נבחר)
  let total = p.status !== 'all' ? (counts[p.status] ?? 0) : (counts.all ?? 0)

  // 🔴 סינון מכותרת דורש ספירה משלו: counts אינו מכיר אותו, ולכן הדפדוף
  // היה מציע עמודים שאינם קיימים — "1–50 מתוך 7,066" על טבלה שיש בה 12
  // שורות, ולחיצה על "הבא" מגיעה לדף ריק.
  //
  // ⚠️ שאילתה נוספת רק כשיש סינון פעיל: count:'exact' הוא סריקה בפועל,
  // ולא כדאי לשלם עליה בכל טעינת דף.
  if (Object.keys(p.colFilters).length > 0) {
    try {
      // ⚠️ הטיפוס מורחב במפורש: שרשור הפילטרים על ה-query builder של
      // Supabase מייצר היררכיית טיפוסים עמוקה מדי ל-tsc (TS2589).
      // אותה תבנית כבר בשימוש ב-applySpecial/applyEmailFilter.
      type CountQ = {
        eq: (c: string, v: unknown) => CountQ
        or: (f: string) => CountQ
        in: (c: string, v: string[]) => CountQ
        is: (c: string, v: null) => CountQ
        not: (c: string, o: string, v: null) => CountQ
        neq: (c: string, v: string) => CountQ
        then: PromiseLike<{ count: number | null; error: { message: string } | null }>['then']
      }
      let cq = supabase.from('beneficiaries')
        .select('id', { count: 'exact', head: true }) as unknown as CountQ
      cq = applySpecial(cq)
      if (p.status === 'pending') cq = cq.or(PENDING_OR)
      else if (p.status !== 'all') cq = cq.eq('eligibility_status', p.status)
      if (maritalValues.length) cq = cq.in('marital_status', maritalValues)
      if (p.email && p.email !== 'all') cq = applyEmailFilter(cq, p.email)
      if (p.q) cq = cq.or(searchOr(p.q))
      cq = applyColFilters(cq, p.colFilters)
      const { count, error: cErr } = await cq
      if (!cErr && count != null) total = count
    } catch (e) {
      // ⚠️ כשל בספירה אינו מפיל את הדף — הרשימה חשובה יותר מהמונה.
      console.error('[beneficiaries] ספירת הסינון נכשלה:', e)
    }
  }

  // ── אפשרויות הסינון לכותרות ────────────────────────────────────────────
  // 🔴 מהמסד ולא מהשורות שבדף: הדף מחזיק 50 מתוך 7,066, וגזירה ממנו
  // הייתה מציגה 6 ערים מתוך 75 עם מונים שקריים.
  const filterOptions = await getFilterOptions(supabase, special)

  return { rows: (data ?? []) as unknown as Beneficiary[], total, counts, filterOptions }
}
