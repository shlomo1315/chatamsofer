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
import { sameName as samePerson } from './lineageRefAlign'

/** בודק שם+דור מול הקובץ המאושר. */
export type ApprovedRefLookup = (name: string, generation: number) => boolean

let _cache: { at: number; keys: Set<string>; rows: { name: string; generation: number }[] } | null = null
const TTL_MS = 5 * 60_000

const keyOf = (name: string, generation: number) => `${normalizeName(name)}|${generation}`

/**
 * הבודק עצמו — התאמה מלאה, ואם נכשלה: התאמה לפי שם הבעל באותו דור.
 *
 * 🔴 מוגדר פעם אחת ומשמש גם את הנתיב הממוטמן וגם את נתיב הטעינה.
 */
const lookupOf = (keys: Set<string>, rows: { name: string; generation: number }[] = []): ApprovedRefLookup => (name, gen) => {
  if (keys.has(keyOf(name, gen))) return true
  const h = coupleKey(name)
  if (h && keys.has(`h:${h}|${gen}`)) return true
  // 🔴 (12.10) אחרי יישור העץ לקובץ, צומת עשוי לשאת את השם *המלא* ("רבי מנחם
  // זאב ומרת רבקה גרוס") כשבקובץ רק "מרת רבקה גרוס". אותו אדם — לא אדום.
  return rows.some(r => r.generation === gen && samePerson(r.name, name))
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
    return lookupOf(_cache.keys, _cache.rows)
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
    const rows = (data as { name: string; generation: number }[]).map(r => ({ name: r.name, generation: r.generation }))
    _cache = { at: now, keys, rows }
    return lookupOf(keys, rows)
  } catch (e) {
    console.error('[approvedRef] טעינת הייחוס המאושר נכשלה — לא נחסם דבר:', e)
    return () => true
  }
}

/** לאיפוס המטמון אחרי עדכון הטבלה. */
export function invalidateApprovedRef(): void { _cache = null; _treeCache = null }

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 בדיקה מלאה לבורר: שם + דור + *הורה*.
//
// ⚠️ שם ודור לבדם אינם מספיקים בבורר: "רבי אברהם חנוך וחנה חייטשא פרידמן"
// הוא דור 3 בקובץ — אבל בנו של רבי צבי יהודה פרידמן, לא של הכתב סופר. בעץ
// הוא יושב תחת הכתב סופר, ובורר שבודק שם+דור הציע אותו שם כבן (11.10).
// הצבע בכרטסת נשאר לפי שם+דור (getApprovedRefLookup); הבורר מחמיר, כי מה
// שנבחר בו נבנה עליו סדר ייחוס שלם.
//
// ⚠️ דור 2: ההורה הוא השורש, ושמו בעץ ("מרן החתם סופר זי״ע") שונה מהקובץ
// ("החתם סופר"). השורש מזוהה לפי מיקום — ראו PublicPortalPage/prefill.
// ─────────────────────────────────────────────────────────────────────────────

/** (שם, דור, שם ההורה בעץ) → האם הצומת יושב בקובץ המאושר בדיוק במקום הזה. */
export type ApprovedRefTreeLookup = (name: string, generation: number, parentName: string | null) => boolean

interface RefTreeRow { key: string; name: string; generation: number; parent_key: string | null }

/** אותו אדם — שם מנורמל זהה, או בעל + שם משפחה זהים ("ומרת רחל" מול "ורחל"). */
function sameRefName(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return true
  const ka = coupleKey(a)
  if (ka && ka === coupleKey(b)) return true
  // ⚠️ שם מלא מול שם חלקי בקובץ — ראו lookupOf.
  return samePerson(a, b)
}

export function buildApprovedRefTree(rows: RefTreeRow[]): ApprovedRefTreeLookup {
  const byKey = new Map(rows.map(r => [r.key, r]))
  return (name, generation, parentName) => {
    const cands = rows.filter(r => r.generation === generation && sameRefName(r.name, name))
    if (!cands.length) return false
    if (generation <= 2 || parentName == null) return true
    return cands.some(r => {
      const p = r.parent_key ? byKey.get(r.parent_key) : undefined
      return !!p && sameRefName(p.name, parentName)
    })
  }
}

let _treeCache: { at: number; lookup: ApprovedRefTreeLookup } | null = null

/**
 * ⚠️ כשל בטעינה (או טבלה ריקה — RLS) מחזיר בודק מתירני: הבורר נופל לסינון
 * לפי התווית בלבד, כמו לפני התיקון, ולא נתקע מול רשימה ריקה לכולם.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getApprovedRefTree(db: any): Promise<ApprovedRefTreeLookup> {
  const now = Date.now()
  if (_treeCache && now - _treeCache.at < TTL_MS) return _treeCache.lookup
  try {
    const { data, error } = await db.from('lineage_approved_ref').select('key, name, generation, parent_key')
    if (error || !Array.isArray(data) || data.length === 0) throw new Error('approved_ref load failed/empty')
    const lookup = buildApprovedRefTree(data as RefTreeRow[])
    _treeCache = { at: now, lookup }
    return lookup
  } catch (e) {
    console.error('[approvedRef] טעינת עץ הייחוס המאושר נכשלה — הבורר לפי התווית בלבד:', e)
    return () => true
  }
}

/**
 * הבודק של הבורר עבור ילדי צומת נתון — האתר וטופס נדרים קוראים לאותה פונקציה,
 * כדי ששני הבוררים לא יחלקו על אותו דור.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPickerApproval(db: any, parentId: string | null): Promise<ApprovedRefLookup> {
  const tree = await getApprovedRefTree(db)
  let parentName: string | null = null
  // ⚠️ כשל בשליפת ההורה אינו מפיל את הבורר — נשארת בדיקת שם+דור.
  if (parentId) {
    try {
      const { data } = await db.from('lineage_nodes').select('name').eq('id', parentId).maybeSingle()
      parentName = data?.name ?? null
    } catch (e) {
      console.error('[approvedRef] שליפת שם ההורה נכשלה — בדיקת שם+דור בלבד:', e)
    }
  }
  return (name, generation) => tree(name, generation, parentName)
}
