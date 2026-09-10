// ─────────────────────────────────────────────────────────────────────────────
// בריאות שרשרת הדורות — מה מחזיר כרטסת לבדיקה מעמיקה אחרי תיקון.
//
// 🔴 דילוג דורות בלבד. הפרש גדול מ-1 בין צומת לאביו פירושו שדורות שלמים
// נעלמו מהשרשרת — בדיוק מה שקרה אצל רובינסקי: דור 6 חובר ישירות לדור 2,
// וארבעה דורות פרידמן שקיימים בעץ לא הופיעו בכלל.
//
// ⚠️ סטטוס הצומת (pending/verified) *אינו* קריטריון: 10,180 צמתים —
// 96% מהעץ — מסומנים pending משום שאיש לא עבר עליהם, ולא משום שיש בהם
// בעיה. חסימה על pending הייתה שולחת כמעט כל משפחה לבדיקה מעמיקה
// ומבטלת את התועלת שבקליטה האוטומטית.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainNode {
  id: string
  parent_id: string | null
  generation: number
}

/**
 * האם בשרשרת מהצומת עד השורש יש דילוג דורות.
 *
 * ⚠️ עולה עד השורש ולא בודק רק את הצומת עצמו: דילוג שלושה דורות מעליו
 * פוסל את הייחוס בדיוק כמו דילוג צמוד.
 *
 * ⚠️ נתון חסר (צומת שאינו במפה, הורה שנמחק) אינו מדווח כדילוג — היעדר
 * מידע אינו ראיה לבעיה, וסימון שגוי היה שולח משפחות תקינות לבדיקה.
 */
export function chainHasGap(nodeId: string, byId: Map<string, ChainNode>): boolean {
  // ⚠️ תקרה על מספר הצעדים: עץ פגום עם מעגל היה תולה את השרת.
  const seen = new Set<string>()
  let cur = byId.get(nodeId)
  while (cur?.parent_id) {
    if (seen.has(cur.id)) return false
    seen.add(cur.id)
    const parent = byId.get(cur.parent_id)
    if (!parent) return false
    if (cur.generation - parent.generation > 1) return true
    cur = parent
  }
  return false
}

/** סטטוס הזכאות שאליו הכרטסת חוזרת אחרי שהתיקון נקלט. */
export function statusAfterFix(hasGap: boolean): 'pending' | 'deep_review' {
  return hasGap ? 'deep_review' : 'pending'
}
