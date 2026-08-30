// ─────────────────────────────────────────────────────────────────────────────
// חוליות חסומות בעץ הדורות.
//
// 🔴 הבאג שזה מציף: צומת שסטטוסו אינו 'verified' אך *ילדיו* מאומתים חוסם את
// כל תת-העץ שמתחתיו. בורר הדורות יורד מהשורש ומדלג על צומת לא-מאומת, ולכן
// הצאצאים המאומתים שמתחתיו בלתי נגישים לחלוטין — המשפחה לא מוצאת את עצמה
// והבורר נעצר באמצע.
//
// בפועל נמצאו 4 חוליות כאלה שחסמו 38 צאצאים מאומתים (11% מהעץ המאושר),
// אחת מהן בדור 3 — שני דורות מהשורש.
//
// ⚠️ הסימן המובהק: מישהו כבר אישר ידנית את הילדים. אי אפשר לאשר ילד בלי
// שההורה קיים, ולכן ההורה הוכר בפועל — רק הסטטוס שלו לא עודכן. זו תקלת
// נתונים ולא שאלה גנאלוגית פתוחה.
//
// המודול טהור: מקבל צמתים ומחזיר רשימה. אין בו גישה למסד ואין בו כתיבה —
// ההחלטה לאשר נשארת אנושית.
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockedNode {
  id: string
  name: string
  parent_id: string | null
  generation: number | null
  status: string | null
}

export interface BlockedLink {
  id: string
  name: string
  generation: number | null
  status: string | null
  /** כמה ילדים מאומתים יושבים ישירות מתחתיו. */
  verifiedChildren: number
  /** כמה צמתים בסך הכל בתת-העץ שמתחתיו (כולל לא-מאומתים). */
  subtreeSize: number
  /** שרשרת האבות מהשורש ועד ההורה שלו — כולם מאומתים, אחרת הוא לא באמת הצוואר. */
  ancestorsVerified: boolean
}

/**
 * החוליות החסומות: צומת לא-מאומת שיש לו לפחות ילד אחד מאומת.
 *
 * ⚠️ ממוין לפי הדור — חוליה קרובה לשורש חוסמת יותר משפחות, ולכן היא
 * הדחופה יותר. שתי חוליות באותו דור ממוינות לפי מספר הילדים החסומים.
 */
export function findBlockedLinks(nodes: BlockedNode[]): BlockedLink[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const childrenOf = new Map<string, BlockedNode[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const arr = childrenOf.get(n.parent_id)
    if (arr) arr.push(n)
    else childrenOf.set(n.parent_id, [n])
  }

  const isVerified = (n: BlockedNode | undefined) => (n?.status ?? '') === 'verified'

  // גודל תת-העץ, עם הגנה מפני מעגלים (מעגל בעץ אינו תיאורטי — ראו lineageForest).
  const subtreeSize = (rootId: string): number => {
    let count = 0
    const seen = new Set<string>()
    const stack = [rootId]
    while (stack.length) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const c of childrenOf.get(cur) ?? []) {
        count++
        stack.push(c.id)
      }
    }
    return count
  }

  // כל שרשרת האבות מאומתת — אם לא, הצוואר האמיתי נמצא גבוה יותר.
  const ancestorsAllVerified = (n: BlockedNode): boolean => {
    const guard = new Set<string>([n.id])
    let cur = n.parent_id ? byId.get(n.parent_id) : undefined
    while (cur) {
      if (guard.has(cur.id)) return false
      guard.add(cur.id)
      if (!isVerified(cur)) return false
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return true
  }

  const out: BlockedLink[] = []
  for (const n of nodes) {
    if (isVerified(n)) continue
    const kids = childrenOf.get(n.id) ?? []
    const verifiedChildren = kids.filter(isVerified).length
    if (verifiedChildren === 0) continue
    out.push({
      id: n.id,
      name: n.name,
      generation: n.generation,
      status: n.status,
      verifiedChildren,
      subtreeSize: subtreeSize(n.id),
      ancestorsVerified: ancestorsAllVerified(n),
    })
  }

  return out.sort((a, b) =>
    (a.generation ?? 999) - (b.generation ?? 999) || b.verifiedChildren - a.verifiedChildren)
}
