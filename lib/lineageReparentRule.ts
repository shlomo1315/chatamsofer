// ─────────────────────────────────────────────────────────────────────────────
// הכלל של "החלף דור" בקישור תיקון סדר הדורות.
//
// "במקום X יבוא Y" = הבן של X עובר להיות תלוי ב-Y, כש-Y הוא *אחיו* של X —
// ילד של אותו סב. זו כל מהות התיקון ("אינני צאצא של הבן הזה אלא של אחיו"),
// וזו גם ההגבלה שמונעת קפיצת דורות או לולאה.
//
// 🔴 הבאג (11.10): השרת השווה את הורה Y להורה *של הבן* (כלומר ל-X עצמו)
// במקום להורה של X. כל בחירה נדחתה, והבורר נראה כאילו אינו מגיב.
// ─────────────────────────────────────────────────────────────────────────────

interface Row { id: string; parent_id: string | null }

/** האם newParentId הוא אח של האב הנוכחי של nodeId (ילד של סבו). */
export function isSiblingOfCurrentParent(nodes: Row[], nodeId: string, newParentId: string): boolean {
  if (!nodeId || !newParentId || nodeId === newParentId) return false
  const byId = new Map(nodes.map(n => [n.id, n]))
  const node = byId.get(nodeId)
  const candidate = byId.get(newParentId)
  if (!node || !candidate || !node.parent_id) return false
  const currentParent = byId.get(node.parent_id)
  if (!currentParent) return false
  return (candidate.parent_id ?? null) === (currentParent.parent_id ?? null)
}
