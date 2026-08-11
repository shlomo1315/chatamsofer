// הקבוצות (הלשוניות) של רשימת היולדות — הגדרה אחת שמשרתת את הרשימה *וגם* את
// ניווט "הבאה/הקודמת" בכרטסת.
//
// 🔴 למה משותף: הלשוניות חיו בתוך MaternityTable, וניווט הבאה/קודמת בכרטסת
// רץ על *כל* הטבלה לפי created_at בלי קשר ללשונית. מי שנכנס מ"ממתין לאישור"
// ולחץ "הבאה" נחת על יולדת מאושרת, ואיבד את הרצף שבו עבד.
//
// ⚠️ "ממתין לתיקונים" אינו סטטוס במסד. הוא נגזר: תיק שעדיין ממתין לאישור,
// ושנשלחה עליו בקשת תיקון שטרם חזרה. אין לו עמודה משלו, ולכן כל מי שמציג
// אותו חייב לחשב אותו מאותם שדות — אחרת הרשימה והניווט חלוקים ביניהם.
import { isNamePending, type AidNameFields } from './babyNames'

export type MaternityBucket = 'all' | 'pending' | 'pending_fixes' | 'active' | 'cancelled' | 'deep_review'

const BUCKETS: MaternityBucket[] = ['all', 'pending', 'pending_fixes', 'active', 'cancelled', 'deep_review']

export const BUCKET_LABEL: Record<MaternityBucket, string> = {
  all: 'הכל',
  pending: 'ממתין לאישור',
  pending_fixes: 'ממתין לתיקונים',
  deep_review: 'ממתין לאישור מנהל',
  active: 'מאושר',
  cancelled: 'לא מאושר',
}

export function isBucket(v: unknown): v is MaternityBucket {
  return typeof v === 'string' && (BUCKETS as string[]).includes(v)
}

export interface BucketAid extends AidNameFields {
  status?: string | null
  /** ⚠️ join של Supabase מחזיר לפעמים מערך — שני הצדדים נתמכים. */
  beneficiary?: { eligibility_status?: string | null } | { eligibility_status?: string | null }[] | null
}

const eligibility = (a: BucketAid): string => {
  const b = a.beneficiary
  const one = Array.isArray(b) ? b[0] : b
  return String(one?.eligibility_status ?? '')
}

/**
 * תיק שממתין לתיקון מצד היולדת.
 *
 * שני מקורות, ושניהם נשלחים מהכרטסת:
 *  • תיקון שם — send-name-fix מרים baby_name_pending, והדגל נכבה מאליו כשהשם
 *    נקלט (lib/babyNames).
 *  • השלמת מסמכים — docs-fix מעביר את המשפחה ל-docs_pending, והיא עוברת
 *    ל-docs_returned כשהמסמכים חוזרים (lib/docsReturnCheck).
 *
 * 🔴 המקור השני נוסף כאן. קודם רק תיקון שם נספר, ולכן תיק שנשלחה עליו בקשת
 * מסמכים המשיך לשבת ב"ממתין לאישור" — המזכירות ראתה אותו כדורש טיפול בזמן
 * שהכדור היה אצל היולדת, וחיפשה שוב ושוב מה חסר בו.
 *
 * ⚠️ רק תיק שעדיין 'pending'. תיק שאושר או בוטל — הטיפול בו נגמר, ואם ייספר
 * גם כאן סכום הלשוניות יעלה על סך הכול.
 */
export function awaitingFixes(a: BucketAid): boolean {
  if ((a.status ?? '') !== 'pending') return false
  return isNamePending(a) || eligibility(a) === 'docs_pending'
}

export function matchesBucket(a: BucketAid, bucket: MaternityBucket): boolean {
  if (bucket === 'all') return true
  if (bucket === 'pending_fixes') return awaitingFixes(a)
  // "ממתין לאישור" אינו כולל את מי שממתין לתיקון — הם לשונית נפרדת, אחרת
  // אותו תיק נספר פעמיים.
  if (bucket === 'pending') return a.status === 'pending' && !awaitingFixes(a)
  return a.status === bucket
}

export interface AdjacentRow extends BucketAid {
  id: string
  created_at?: string | null
}

/** סדר הרשימה הראשית: created_at יורד, חדש→ישן. שובר שוויון ב-id ליציבות. */
const before = (a: { created_at?: string | null; id: string }, b: { created_at?: string | null; id: string }) => {
  const ta = String(a.created_at ?? ''), tb = String(b.created_at ?? '')
  return ta === tb ? a.id < b.id : ta > tb
}

/**
 * השכנים של התיק הנוכחי *בתוך הקבוצה*, לפי סדר הרשימה.
 * "הבאה" = הישנה יותר (למטה ברשימה), "הקודמת" = החדשה יותר.
 *
 * ⚠️ נמדד מול מיקומו של התיק הנוכחי בזמן, ולא מול מקומו ברשימה המסוננת —
 * כי הוא עצמו כבר עשוי לא להיות בקבוצה. זה בדיוק המצב הרגיל: פותחים תיק
 * מ"ממתין לאישור", מאשרים אותו, ואז לוחצים "הבאה". אילו חיפשנו את מקומו
 * ברשימה המסוננת, הרצף היה נקטע בדיוק ברגע שבו טיפלנו בתיק.
 */
export function adjacentInBucket(
  rows: AdjacentRow[], current: { id: string; created_at?: string | null }, bucket: MaternityBucket,
): { prevId: string | null; nextId: string | null } {
  let prev: AdjacentRow | null = null   // החדשה ביותר מבין הישנות-מ... כלומר הקרובה מלמעלה
  let next: AdjacentRow | null = null
  for (const r of rows) {
    if (r.id === current.id || !matchesBucket(r, bucket)) continue
    if (before(r, current)) {
      // r חדשה יותר מהנוכחית → מועמדת ל"הקודמת". רוצים את הקרובה ביותר, כלומר הישנה שבהן.
      if (!prev || before(prev, r)) prev = r
    } else {
      // r ישנה יותר → מועמדת ל"הבאה". רוצים את הקרובה ביותר, כלומר החדשה שבהן.
      if (!next || before(r, next)) next = r
    }
  }
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null }
}
