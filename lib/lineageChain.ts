// ─────────────────────────────────────────────────────────────────────────────
// טיפוס בשרשרת ההורים — מקור אמת יחיד.
//
// 🔴 למה זה קיים: ארבעה מסכים טיפסו בשרשרת עם מונה צעדים בלבד
// (`while (cur && guard < 80)`) ובלי מעקב אחרי צמתים שכבר נראו. כשנוצר
// מעגל בנתונים (25.08 — מיזוג cascade שמיזג אב לתוך צאצא), הלולאה רצה
// 80 פעם והמסך הציג את אותם שני שמות עד "דור 50", וכל העץ נצבע אדום.
//
// ⚠️ המונה לבדו אינו הגנה: הוא מגביל את הנזק אך אינו מזהה אותו. מעקב
// `seen` עוצר *בדיוק* בנקודת המעגל, ומאפשר לדווח עליו במקום להמציא דורות.
//
// ⚠️ מעגל בנתונים אינו "לא אמור לקרות": הוא קרה בפרודקשן. תצוגה שמניחה
// נתונים תקינים היא תצוגה שמשקרת בדיוק כשהכי חשוב לדעת את האמת.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainNode {
  id: string
  parent_id?: string | null
}

export interface ChainResult<T> {
  /** השרשרת מהשורש עד הצומת המבוקש. */
  chain: T[]
  /**
   * 🔴 true כשהטיפוס נעצר בגלל מעגל.
   * הקורא חייב להציג אזהרה — שרשרת חלקית שנראית שלמה היא הטעיה.
   */
  cycle: boolean
}

/** תקרת בטיחות. מעל זה — הנתונים פגומים ממילא. */
const MAX_DEPTH = 200

/**
 * מטפס מצומת אל השורש ומחזיר את השרשרת בסדר שורש → צומת.
 *
 * ⚠️ עוצר בצומת שכבר נראה ומסמן `cycle: true`. הצומת החוזר *אינו* נכלל
 * שוב — אחרת השרשרת מכילה כפילות שנראית כמו דור אמיתי.
 */
export function ancestorChain<T extends ChainNode>(
  startId: string | null | undefined,
  byId: Map<string, T>,
): ChainResult<T> {
  const chain: T[] = []
  if (!startId) return { chain, cycle: false }

  const seen = new Set<string>()
  let cur = byId.get(startId)
  let cycle = false

  while (cur) {
    if (seen.has(cur.id)) { cycle = true; break }
    if (chain.length >= MAX_DEPTH) { cycle = true; break }
    seen.add(cur.id)
    chain.unshift(cur)
    const pid = cur.parent_id
    cur = pid ? byId.get(pid) : undefined
  }

  return { chain, cycle }
}

/** רק המזהים — לקוראים שאינם צריכים את הצמתים עצמם. */
export function ancestorIds<T extends ChainNode>(
  startId: string | null | undefined,
  byId: Map<string, T>,
): string[] {
  return ancestorChain(startId, byId).chain.map(n => n.id)
}

/**
 * האם `ancestorId` נמצא בשרשרת ההורים של `nodeId`.
 * ⚠️ ההגנה שמונעת מיזוג של אב לתוך צאצא — ראו lib/lineageMerge.
 */
export function isAncestor<T extends ChainNode>(
  ancestorId: string, nodeId: string, byId: Map<string, T>,
): boolean {
  const { chain } = ancestorChain(nodeId, byId)
  return chain.some(n => n.id === ancestorId && n.id !== nodeId)
}
