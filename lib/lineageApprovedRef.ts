// ─────────────────────────────────────────────────────────────────────────────
// טעינת הייחוס המאושר — 233 השורות של 5 הדורות הראשונים.
//
// 🔴 מקור אמת יחיד לצביעה: כל מסך שמציג צבעי דורות חייב לעבור דרך כאן,
// אחרת שני מסכים יחלקו על אותו צומת — בדיוק מה שקרה עד היום, כשהצבע
// נגזר מהתווית שעל הצומת ולא מהקובץ.
//
// ⚠️ מטמון בזיכרון: הטבלה קבועה (233 שורות שאינן משתנות בשוטף), וקריאה
// לכל טעינת כרטסת הייתה מוסיפה סבב מסד מיותר לכל צפייה.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from './lineageChainDiff'

/** בודק שם+דור מול הקובץ המאושר. */
export type ApprovedRefLookup = (name: string, generation: number) => boolean

let _cache: { at: number; keys: Set<string> } | null = null
const TTL_MS = 5 * 60_000

const keyOf = (name: string, generation: number) => `${normalizeName(name)}|${generation}`

/**
 * מחזיר בודק מול הייחוס המאושר.
 *
 * ⚠️ כשל בטעינה מחזיר בודק שמאשר הכול — ולא בודק שפוסל הכול. עמוד שנכשל
 * בשליפה היה צובע את כל 5 הדורות באדום אצל כל משפחה, כלומר התראה גורפת
 * שמקורה בתקלה ולא בנתונים.
 */
// ⚠️ any: הטיפוס הנגזר מהסכימה של supabase-js אינו Promise פשוט, והצרתו
// כאן הייתה מחייבת לשכפל את כל שרשרת הבנאים רק כדי לקרוא שתי עמודות.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getApprovedRefLookup(db: any): Promise<ApprovedRefLookup> {
  const now = Date.now()
  if (_cache && now - _cache.at < TTL_MS) {
    const keys = _cache.keys
    return (name, gen) => keys.has(keyOf(name, gen))
  }

  try {
    const { data, error } = await db.from('lineage_approved_ref').select('name, generation')
    if (error || !Array.isArray(data)) throw new Error('approved_ref load failed')
    const keys = new Set<string>()
    for (const r of data as { name: string; generation: number }[]) {
      keys.add(keyOf(r.name, r.generation))
    }
    _cache = { at: now, keys }
    return (name, gen) => keys.has(keyOf(name, gen))
  } catch (e) {
    console.error('[approvedRef] טעינת הייחוס המאושר נכשלה — לא נחסם דבר:', e)
    return () => true
  }
}

/** לאיפוס המטמון אחרי עדכון הטבלה. */
export function invalidateApprovedRef(): void { _cache = null }
