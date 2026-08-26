// ─────────────────────────────────────────────────────────────────────────────
// ספירת תיקי היולדות לדשבורד — לפי *אותם* כללים של מסך היולדות.
//
// 🔴 הדשבורד הציג "2 ממתינות לאישור מנהל" בזמן שמסך היולדות הציג 0.
// שני המספרים היו נכונים, כל אחד לפי הכלל שלו: הדשבורד ספר
// `.eq('status','deep_review')` גולמי, והרשימה מסננת דרך matchesBucket —
// שמוריד תיק שנשלח אליו בירור והיולדת טרם ענתה (awaitingInquiryReply).
//
// זו אותה תקלה שכבר תוקנה כאן שלוש פעמים: "כרטיסים טעונים" 52 מול 49,
// "מלאי" 23 במקום 299, "תיקים פעילים" 50 מול 49. בכל פעם השורש זהה —
// הדשבורד ספר בשאילתה משלו במקום דרך מקור האמת.
//
// ⚠️ הכלל אינו משוכפל כאן. הספירה מריצה את matchesBucket מ-maternityBuckets,
// ולכן כל שינוי בכללי הלשוניות נכנס לדשבורד מאליו. חיקוי של הכלל היה
// נפרד ממנו שוב בשינוי הבא.
//
// ⚠️ לידות שקטות מוחרגות — הן בלשונית נפרדת ואינן במסך היולדות.
// ─────────────────────────────────────────────────────────────────────────────
import { matchesBucket, type BucketAid, type MaternityBucket } from './maternityBuckets'

/** העמודות הדרושות לספירה — בדיוק אלה שהכללים נוגעים בהן. */
export const COUNT_SELECT =
  'id, status, birth_type, baby_name_pending, beneficiary:beneficiaries(eligibility_status)'

export interface CountAid extends BucketAid {
  id: string
  birth_type?: string | null
}

/**
 * לקוח Supabase — מוגדר רופף בכוונה.
 *
 * ⚠️ טיפוס מדויק כאן מפיל את tsc ב-"Type instantiation is excessively deep":
 * הטיפוסים המחוללים של PostgREST עמוקים מדי לשרשור הזה. הבדיקה האמיתית
 * היא הטסטים, שמריצים את הספירה על נתונים אמיתיים.
 */
type Db = {
  from: (t: string) => {
    select: (s: string) => {
      in: (col: string, vals: string[]) => PromiseLike<{ data: unknown }>
    }
  }
}

/** לידה שקטה — מוחרגת מהרשימה ולכן גם מהמונים. */
const isSilent = (a: CountAid) => (a.birth_type ?? '') === 'silent'

/**
 * מצמיד לכל תיק את כיוון ההודעה האחרונה בשרשור הבירור.
 *
 * ⚠️ שליפה נפרדת וקלה ולא join — join היה מחזיר את הטקסט המלא של כל
 * ההודעות לכל השורות. נשלף רק הכיוון, וזה כל מה שההחלטה דורשת.
 *
 * ⚠️ כשל אינו מסתיר תיקים: בלי המידע כולם נספרים, וזה הצד הבטוח —
 * מונה גבוה מדי מוביל לבדיקה, מונה נמוך מדי מסתיר עבודה.
 */
async function attachInquiry(db: Db, rows: CountAid[]): Promise<void> {
  const openIds = rows.filter(a => a.status === 'pending' || a.status === 'deep_review').map(a => a.id)
  if (!openIds.length) return
  try {
    const { data } = await db.from('maternity_messages')
      .select('aid_id, direction, created_at')
      .in('aid_id', openIds)
    const msgs = (data ?? []) as { aid_id: string; direction: string; created_at: string }[]
    // הראשון שנראה לכל תיק הוא האחרון בזמן — ממיינים כאן ולא בשאילתה,
    // כדי שהספירה לא תסתמך על סדר שהמסד עשוי לשנות.
    const sorted = [...msgs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const lastDir: Record<string, string> = {}
    for (const m of sorted) if (!lastDir[m.aid_id]) lastDir[m.aid_id] = m.direction
    for (const a of rows) a.inquiryLastDirection = lastDir[a.id] ?? null
  } catch { /* בלי המידע — כולם נספרים */ }
}

export interface MaternityCounts {
  pending: number
  deepReview: number
  active: number
}

/**
 * המונים של הדשבורד — זהים למה שמסך היולדות מציג בלשוניות.
 *
 * ⚠️ נשלפים רק התיקים הפתוחים והמאושרים. תיקים מבוטלים אינם נספרים
 * באף מונה כאן, ולכן אין טעם למשוך אותם.
 */
export async function maternityCounts(db: Db): Promise<MaternityCounts> {
  const { data } = await db.from('maternity_aids')
    .select(COUNT_SELECT)
    .in('status', ['pending', 'deep_review', 'active'])

  const rows = ((data ?? []) as CountAid[]).filter(a => !isSilent(a))
  await attachInquiry(db, rows)

  const n = (bucket: MaternityBucket) => rows.filter(a => matchesBucket(a, bucket)).length
  return { pending: n('pending'), deepReview: n('deep_review'), active: n('active') }
}
