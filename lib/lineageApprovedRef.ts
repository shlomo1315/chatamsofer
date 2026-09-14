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

import { normalizeName, husbandName } from './lineageChainDiff'

/** בודק שם+דור מול הקובץ המאושר. */
export type ApprovedRefLookup = (name: string, generation: number) => boolean

let _cache: { at: number; keys: Set<string> } | null = null
const TTL_MS = 5 * 60_000

const keyOf = (name: string, generation: number) => `${normalizeName(name)}|${generation}`

/**
 * הבודק עצמו — התאמה מלאה, ואם נכשלה: התאמה לפי שם הבעל באותו דור.
 *
 * 🔴 מוגדר פעם אחת ומשמש גם את הנתיב הממוטמן וגם את נתיב הטעינה.
 */
const lookupOf = (keys: Set<string>): ApprovedRefLookup => (name, gen) => {
  if (keys.has(keyOf(name, gen))) return true
  const h = coupleKey(name)
  return !!h && keys.has(`h:${h}|${gen}`)
}

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
    // ⚠️ אותו בודק בדיוק כמו בנתיב הטעינה — ראו lookupOf. שני עותקים של
    // הכלל היו נפרדים בשקט, ואז הצבע היה תלוי במטמון ולא בנתונים.
    return lookupOf(_cache.keys)
  }

  try {
    const { data, error } = await db.from('lineage_approved_ref').select('name, generation')
    if (error || !Array.isArray(data)) throw new Error('approved_ref load failed')
    // 🔴 טבלה ריקה היא *תקלה*, לא "קובץ בלי שורות".
    //
    // ⚠️ ב-lineage_approved_ref מופעל RLS בלי אף מדיניות: לקוח מבוסס-סשן מקבל
    // data=[] ו-error=null — כלומר "הצלחה" שמכילה אפס שורות. התוצאה הייתה
    // inRef=false לכל שם, וכל דורות 2–5 אדומים אצל *כל* המשפחות (14.09).
    // נפילה לבודק המתירני מציגה את התווית, וזה עדיף על התראה כוזבת גורפת.
    if (data.length === 0) throw new Error('approved_ref empty — RLS או טבלה ריקה')
    const keys = new Set<string>()
    for (const r of data as { name: string; generation: number }[]) {
      keys.add(keyOf(r.name, r.generation))
      // ─────────────────────────────────────────────────────────────────────
      // 🔴 מפתח שני — לפי שם הבעל, כדי ש"ומרת" מול "ו" לא ייחשב אדם אחר.
      //
      // ⚠️ הבאג (14.09-15.09, לוק אביגיל): בקובץ "רבי רפאל ורחל דויטש"
      // ובעץ "רבי רפאל ומרת רחל דויטש" — אותו אדם, מילה אחת שונה, ודור 3
      // נצבע אדום. אותו דבר בדור 4. המזכירות לא יכלה לאשר יולדות, כי
      // הכרטסת הראתה חריגת ייחוס שאינה קיימת.
      //
      // 🔴 הדור נשמר בהשוואה: husbandName מסיר את האישה אך *שומר את שם
      // המשפחה*, ולכן "משה קורניצר" ו"משה סופר" נשארים נפרדים. בלי הדור
      // היינו מאשרים נין שיושב במקום בן — בדיוק מה שהכלל בא למנוע.
      // ─────────────────────────────────────────────────────────────────────
      const h = coupleKey(r.name)
      if (h) keys.add(`h:${h}|${r.generation}`)
    }
    _cache = { at: now, keys }
    return lookupOf(keys)
  } catch (e) {
    console.error('[approvedRef] טעינת הייחוס המאושר נכשלה — לא נחסם דבר:', e)
    return () => true
  }
}

/** לאיפוס המטמון אחרי עדכון הטבלה. */
export function invalidateApprovedRef(): void { _cache = null }

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מפתח ההשוואה ה"רופף" — שם הבעל ושם המשפחה בלבד.
//
// ⚠️ husbandName לבדו אינו מספיק: הוא חותך "ומרת רחל" אך לא "ורחל"
// המחוברת. בקובץ כתוב "רבי רפאל ורחל דויטש" ובעץ "רבי רפאל ומרת רחל
// דויטש" — אותו אדם, ושני הצדדים חייבים להצטמצם לאותו ערך ("רפאל דויטש").
//
// 🔴 שם המשפחה (המילה האחרונה) נשמר תמיד: בלעדיו "משה קורניצר" ו"משה
// סופר" היו מתמזגים לאדם אחד, וזה בדיוק המיזוג שהכלל בא למנוע.
//
// ⚠️ שם בן שתי מילים ("רבי זלמן סופר") נותר כפי שהוא — אין ממה לחתוך.
// ─────────────────────────────────────────────────────────────────────────────
export function coupleKey(raw: string): string {
  const s = husbandName(raw)
  if (!s) return ''
  const w = s.split(/\s+/).filter(Boolean)
  if (w.length < 3) return s

  const surname = w[w.length - 1]
  // החלק שלפני שם המשפחה — משם מסירים את האישה המחוברת ב-ו'.
  const given = w.slice(0, -1)
  const at = given.findIndex((x, i) => i > 0 && /^ו/.test(x))
  const husband = at > 0 ? given.slice(0, at) : given
  return [...husband, surname].join(' ')
}
