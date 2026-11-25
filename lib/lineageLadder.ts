// ─────────────────────────────────────────────────────────────────────────────
// סולם דורות: אישור ודחייה של צמתים בעץ, דור אחרי דור, מהענף הגדול לקטן.
//
// "מאושר" כאן = status='verified' בצומת עצמו (לא lineage_approved_ref).
// קבוצת הכרעה = ילדי הורה מאושר אחד שיש ביניהם ממתינים. הדור שבעבודה הוא
// הדור הנמוך ביותר שיש בו קבוצה כזו. ממתין שההורה שלו לא מאושר לא נכנס
// לתור: קודם מכריעים על ההורה.
//
// הכול כאן טהור ורץ גם בדפדפן. הכתיבה עצמה עוברת דרך PATCH הקיים
// ב-/api/admin/lineage (פסילה = cascadeRejectSubtree בשרת).
// ─────────────────────────────────────────────────────────────────────────────

export type LadderStatus = 'verified' | 'pending' | 'rejected'

export interface LadderNode {
  id: string
  name: string
  parent_id: string | null
  generation: number | null
  status: LadderStatus
}

export interface LadderIndex {
  byId: Map<string, LadderNode>
  kids: Map<string, LadderNode[]>
  /** צאצאים מתחת לצומת, בלי הצומת עצמו */
  desc: Map<string, number>
  gen: Map<string, number>
  maxGen: number
}

export function buildLadderIndex(nodes: LadderNode[]): LadderIndex {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const kids = new Map<string, LadderNode[]>()
  const roots: LadderNode[] = []
  for (const n of nodes) {
    if (n.parent_id && byId.has(n.parent_id)) {
      const l = kids.get(n.parent_id)
      if (l) l.push(n)
      else kids.set(n.parent_id, [n])
    } else roots.push(n)
  }
  // עומק מהשורש (איטרטיבי, כדי לא לחרוג ממחסנית בעץ עמוק)
  const gen = new Map<string, number>()
  const order: LadderNode[] = []
  const stack: [LadderNode, number][] = roots.map(r => [r, 1])
  while (stack.length) {
    const [n, d] = stack.pop() as [LadderNode, number]
    if (gen.has(n.id)) continue
    gen.set(n.id, n.generation ?? d)
    order.push(n)
    for (const k of kids.get(n.id) ?? []) stack.push([k, (n.generation ?? d) + 1])
  }
  const desc = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i]
    let s = 0
    for (const k of kids.get(n.id) ?? []) s += 1 + (desc.get(k.id) ?? 0)
    desc.set(n.id, s)
  }
  let maxGen = 0
  for (const g of gen.values()) if (g > maxGen) maxGen = g
  return { byId, kids, desc, gen, maxGen }
}

export interface GenRow { g: number; verified: number; pending: number }

/** מאושרים וממתינים בכל דור, מדור 1 עד הדור האחרון. פסולים לא נספרים. */
export function genRows(ix: LadderIndex): GenRow[] {
  const rows: GenRow[] = Array.from({ length: ix.maxGen }, (_, i) => ({ g: i + 1, verified: 0, pending: 0 }))
  for (const n of ix.byId.values()) {
    const g = ix.gen.get(n.id)
    if (!g || g < 1) continue
    if (n.status === 'verified') rows[g - 1].verified++
    else if (n.status === 'pending') rows[g - 1].pending++
  }
  return rows
}

/** מהענף הגדול לקטן; בשוויון לפי השם, כדי שהסדר יהיה יציב. */
export function bySize(ix: LadderIndex) {
  return (a: LadderNode, b: LadderNode) =>
    (ix.desc.get(b.id) ?? 0) - (ix.desc.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'he')
}

/** הורים מאושרים בדור g-1 שיש להם ילדים ממתינים, מהענף הגדול לקטן. */
export function groupParents(ix: LadderIndex, g: number): LadderNode[] {
  const out: LadderNode[] = []
  for (const n of ix.byId.values()) {
    if (n.status !== 'verified' || ix.gen.get(n.id) !== g - 1) continue
    if ((ix.kids.get(n.id) ?? []).some(k => k.status === 'pending')) out.push(n)
  }
  return out.sort(bySize(ix))
}

/** הדור שבעבודה: הנמוך ביותר שיש בו קבוצת הכרעה. null כשאין מה להכריע. */
export function workGen(ix: LadderIndex): number | null {
  let best: number | null = null
  for (const n of ix.byId.values()) {
    if (n.status !== 'pending' || !n.parent_id) continue
    if (ix.byId.get(n.parent_id)?.status !== 'verified') continue
    const g = ix.gen.get(n.id) ?? 0
    if (best === null || g < best) best = g
  }
  return best
}

export interface GroupSnapshot {
  parentId: string
  gen: number
  /** הוכרעו לפני שהקבוצה נפתחה: מאושרים ואחריהם פסולים */
  pre: string[]
  /** להכרעה בסבב הזה, מהגדול לקטן */
  pend: string[]
}

/** צילום הקבוצה בפתיחה. הרשימות נשארות קבועות גם אחרי שמכריעים. */
export function snapshotGroup(ix: LadderIndex, parentId: string): GroupSnapshot {
  const kids = [...(ix.kids.get(parentId) ?? [])].sort(bySize(ix))
  return {
    parentId,
    gen: (ix.gen.get(parentId) ?? 0) + 1,
    pre: [...kids.filter(k => k.status === 'verified'), ...kids.filter(k => k.status === 'rejected')].map(k => k.id),
    pend: kids.filter(k => k.status === 'pending').map(k => k.id),
  }
}

/** ההחלטה בסבב לפי הסטטוס הנוכחי של צומת שהיה ממתין בפתיחה. */
export function decisionOf(n: LadderNode | undefined): 'v' | 'r' | null {
  if (!n) return null
  return n.status === 'verified' ? 'v' : n.status === 'rejected' ? 'r' : null
}

/** הממתין הבא בתור אחרי from (מעגלי), או null כשהכול הוכרע. */
export function nextPending(pend: string[], from: string, isOpen: (id: string) => boolean): string | null {
  const i = pend.indexOf(from)
  for (let k = 1; k <= pend.length; k++) {
    const id = pend[(i + k + pend.length) % pend.length]
    if (isOpen(id)) return id
  }
  return null
}

/** מפתח השוואה לכפילות: המילה הראשונה בשם, בלי גרשיים וסימני פיסוק. */
export function dupKey(name: string): string {
  return name.replace(/["'׳״.,()\-]/g, ' ').trim().split(/\s+/)[0] ?? ''
}

export interface DupInfo {
  key: string
  /** עוד אחים ממתינים עם אותו מפתח */
  others: number
  /** אחים מאושרים עם אותו מפתח */
  verified: LadderNode[]
}

/** אח עם אותו שם פרטי תחת אותו הורה. מסומן רק על צומת שאינו מאושר. */
export function dupInfo(ix: LadderIndex, id: string): DupInfo | null {
  const n = ix.byId.get(id)
  if (!n || n.status === 'verified' || !n.parent_id) return null
  const key = dupKey(n.name)
  if (!key) return null
  const sibs = (ix.kids.get(n.parent_id) ?? []).filter(s => s.id !== id && dupKey(s.name) === key)
  if (!sibs.length) return null
  return { key, others: sibs.filter(s => s.status === 'pending').length, verified: sibs.filter(s => s.status === 'verified') }
}

/** הנתיב מהשורש עד הצומת, כולל. */
export function pathNames(ix: LadderIndex, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur = ix.byId.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur.name)
    cur = cur.parent_id ? ix.byId.get(cur.parent_id) : undefined
  }
  return out
}

/** משפחות מקושרות לצומת ולכל הענף שמתחתיו. */
export function familiesInBranch(ix: LadderIndex, id: string, linked: Record<string, unknown[]>): number {
  let s = 0
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    s += linked[cur]?.length ?? 0
    for (const k of ix.kids.get(cur) ?? []) stack.push(k.id)
  }
  return s
}
