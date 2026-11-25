// ─────────────────────────────────────────────────────────────────────────────
// כללי פסילה ואישור בעץ שתלויים בכיוון: פסילה יורדת, אישור עולה.
//
// 🔴 "אשר גם את האבות" אישר בשקט אב פסול: הלולאה נעצרה רק באב מאושר, ולכן
// אב שנפסל במסלול סומן "מאושר" יחד עם הצומת — והפסילה שלו ושל כל הענף
// שמתחתיו נמחקה בלי שאיש החליט על כך. האישור נעצר עכשיו בצומת פסול.
//
// 🔴 הפסילה המרוכזת במרכז האישורים פסלה רק את הצמתים שנבחרו, בניגוד לפסילה
// בעץ (cascadeRejectSubtree). כך נוצר ענף שבו דור פסול ודור מתחתיו מאושר.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ טהור ובלי ייבוא מ-lineageSync: המסך של העץ משתמש בו בדפדפן.

interface AncestorNode { id: string; parent_id: string | null; status?: string | null }

export interface AncestorsToVerify<T> {
  /** האבות הממתינים שיאושרו, מהקרוב לרחוק. */
  pending: T[]
  /** האב הפסול שבו האישור נעצר. null = לא נתקלנו בפסילה. */
  blockedBy: T | null
}

/** האבות שיאושרו ב"אשר גם את האבות": עד האב המאושר הראשון, ולעולם לא דרך אב פסול. */
export function ancestorsToVerify<T extends AncestorNode>(
  startParentId: string | null,
  get: (id: string) => T | undefined,
  selfId?: string,
): AncestorsToVerify<T> {
  const pending: T[] = []
  const seen = new Set<string>(selfId ? [selfId] : [])
  let cur = startParentId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const a = get(cur)
    if (!a) break
    const st = a.status ?? 'pending'
    if (st === 'verified') break
    if (st === 'rejected') return { pending, blockedBy: a }
    pending.push(a)
    cur = a.parent_id
  }
  return { pending, blockedBy: null }
}

/** פסילה של כמה צמתים = פסילה של כל תת-העץ של כל אחד מהם (כמו בעץ). */
export function expandRejectionTargets(nodes: { id: string; parent_id: string | null }[], ids: string[]): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const list = childrenOf.get(n.parent_id)
    if (list) list.push(n.id)
    else childrenOf.set(n.parent_id, [n.id])
  }
  const out = new Set<string>()
  const stack = [...ids]
  while (stack.length) {
    const cur = stack.pop() as string
    if (out.has(cur)) continue
    out.add(cur)
    for (const c of childrenOf.get(cur) ?? []) stack.push(c)
  }
  return [...out]
}
