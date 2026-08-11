// ─────────────────────────────────────────────────────────────────────────────
// אשכולות מיזוג למרכז המיזוגים — שם זהה *בדיוק* + אותו דור, בלי דרישת אב משותף.
//
// ⚠️ במה זה נבדל מ-safeMergeGroups: שם מפתח הקבוצה שם כולל גם את parent_id,
// כלומר הוא תופס רק עותקים שנרשמו תחת *אותו* אב. אבל הכפילות הנפוצה בעץ הזה
// היא הפוכה: כל נכד רשם את סבו מחדש מתחת לענף שלו, ולכן אותו אדם יושב תחת
// אבות שונים — ואינו נראה שם כלל. זה מסביר אלפי צמתים שנשארו אחרי ההרצות.
//
// ⚠️ הוויתור על האב המשותף מגדיל את הסיכון, ולכן כאן *אין* מיזוג עיוור:
// כל אשכול נשקל ומסומן ברמת ודאות, והמסך מציג אותה למנהל לפני ההכרעה.
// שם זהה בדיוק (כולל תארים ושם האישה — "רבי יהושע ומרת לאה מרים גליק")
// באותו דור הוא ראיה חזקה מאוד; שם קצר ונפוץ הוא ראיה חלשה בהרבה.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClusterNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
  id_number?: string | null
}

export interface ClusterMember extends ClusterNode {
  /** כמה ילדים תלויים בצומת הזה */
  children: number
  /** מזהי כרטסות הצאצא המקושרות לצומת (בד"כ 0 או 1) */
  beneficiaryIds: string[]
  /** שמות הכרטסות — לתצוגה בלבד */
  beneficiaryNames: string[]
}

export type ClusterRisk = 'clean' | 'single_card' | 'multi_card'

export interface MergeCluster {
  key: string
  name: string
  generation: number
  members: ClusterMember[]
  /** הצומת שמומלץ להשאיר */
  suggestedKeepId: string
  /** כמה צמתים ייעלמו במיזוג מלא */
  removable: number
  /** האם כל העותקים תחת אותו אב (אז זו כפילות פשוטה במיוחד) */
  sameParent: boolean
  risk: ClusterRisk
  /** מספר הכרטסות השונות באשכול */
  cardCount: number
}

/** נרמול רווחים בלבד — אותו כלל כמו במסלול הבטוח. בלי הסרת תארים. */
export const clusterNameKey = (name: string) =>
  String(name ?? '').trim().replace(/\s+/g, ' ')

/**
 * בחירת הצומת שיישאר.
 *
 * ⚠️ סדר השיקולים אינו שרירותי — הוא ממוין לפי כמה נזק תגרום בחירה שגויה:
 *  1. מספר כרטסות — צומת שמחובר לכרטסת הוא נקודת האמת של אדם אמיתי במערכת.
 *  2. מספר ילדים — צומת עם צאצאים הוא עוגן של ענף; מיזוג לתוכו מזיז פחות.
 *  3. מאושר לפני ממתין — מצב שאדם כבר בדק.
 *  4. id — הכרעה יציבה, כדי שאותו קלט ייתן תמיד אותה הצעה.
 */
export function suggestKeep(members: ClusterMember[]): string {
  const sorted = [...members].sort((a, b) =>
    b.beneficiaryIds.length - a.beneficiaryIds.length ||
    b.children - a.children ||
    (((b.status ?? 'verified') === 'verified' ? 1 : 0) - ((a.status ?? 'verified') === 'verified' ? 1 : 0)) ||
    a.id.localeCompare(b.id))
  return sorted[0].id
}

/**
 * דירוג הסיכון של אשכול.
 *
 * ⚠️ 'multi_card' אינו "אסור למזג" אלא "אל תמזג בלי להסתכל": שתי כרטסות תחת
 * שם זהה הן או אותו אדם שנרשם פעמיים (ואז המיזוג נכון, ויש גם כפילות
 * בכרטסות לטפל בה), או שני אנשים שונים (ואז מיזוג ידביק שתי משפחות זרות).
 * מהנתונים לבדם אי אפשר להכריע — ולכן ההכרעה חוזרת למנהל.
 */
export function riskOf(cardCount: number): ClusterRisk {
  if (cardCount === 0) return 'clean'
  if (cardCount === 1) return 'single_card'
  return 'multi_card'
}

export function buildClusters(
  nodes: ClusterNode[],
  childCount: Map<string, number>,
  bensByNode: Map<string, { id: string; name: string }[]>,
): MergeCluster[] {
  const byKey = new Map<string, ClusterNode[]>()
  for (const n of nodes) {
    // צומת שנדחה במפורש אינו משתתף — בדיוק כמו בשאר מסלולי המיזוג
    if ((n.status ?? '') === 'rejected') continue
    const nm = clusterNameKey(n.name)
    if (!nm) continue
    const key = `${n.generation}|${nm}`
    const arr = byKey.get(key) ?? []
    arr.push(n)
    byKey.set(key, arr)
  }

  const out: MergeCluster[] = []
  for (const [key, group] of byKey) {
    if (group.length < 2) continue
    const members: ClusterMember[] = group.map(n => {
      const bens = bensByNode.get(n.id) ?? []
      return {
        ...n,
        children: childCount.get(n.id) ?? 0,
        beneficiaryIds: bens.map(b => b.id),
        beneficiaryNames: bens.map(b => b.name),
      }
    })
    const cards = new Set(members.flatMap(m => m.beneficiaryIds))
    const parents = new Set(group.map(n => n.parent_id ?? 'root'))
    out.push({
      key,
      name: clusterNameKey(group[0].name),
      generation: group[0].generation,
      members,
      suggestedKeepId: suggestKeep(members),
      removable: members.length - 1,
      sameParent: parents.size === 1,
      risk: riskOf(cards.size),
      cardCount: cards.size,
    })
  }

  // הגדולים תחילה — שם מרוכזת התוצאה הגבוהה ביותר למאמץ. סדר יציב בתוך
  // אותו גודל, כדי שרענון הדף לא יערבב את התור מתחת לידיים של המנהל.
  return out.sort((a, b) =>
    b.removable - a.removable ||
    a.generation - b.generation ||
    a.name.localeCompare(b.name, 'he'))
}
