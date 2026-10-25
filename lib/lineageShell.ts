// חישובי תצוגה בלבד לעץ הדורות: גזעים, צאצאים וספירות לפי דור.
// אין כאן שום קריאה למסד ואין כתיבה: הכול נגזר מרשימת הצמתים שכבר נטענה.

export interface ShellNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: 'verified' | 'pending' | 'rejected'
  relation?: string | null
}

export const TRUNK_COLORS = ['#0f4c5c', '#7a2e3a', '#56682f', '#3b4a86', '#a0651c', '#4b5a60']

export interface SubStat {
  /** צאצאים, בלי הצומת עצמו */
  desc: number
  verified: number
  pending: number
  rejected: number
}

export interface TrunkStat {
  node: ShellNode
  index: number
  color: string
  stat: SubStat
  children: number
  /** מספר הצמתים של הגזע בכל דור (אינדקס 0 = דור 1 של השורש) */
  byGen: number[]
}

export interface ShellData {
  root: ShellNode | null
  byId: Map<string, ShellNode>
  childrenOf: Map<string, ShellNode[]>
  stats: Map<string, SubStat>
  trunks: TrunkStat[]
  /** אינדקס הגזע של כל צומת (השורש עצמו אינו בגזע) */
  trunkOf: Map<string, number>
  total: number
  verified: number
  pending: number
  rejected: number
  maxGen: number
  /** סך הצמתים בכל דור, אינדקס 0 = דור 1 */
  genTotals: number[]
}

const empty = (): SubStat => ({ desc: 0, verified: 0, pending: 0, rejected: 0 })

export function buildShellData(nodes: ShellNode[]): ShellData {
  const byId = new Map<string, ShellNode>()
  for (const n of nodes) byId.set(n.id, n)
  const childrenOf = new Map<string, ShellNode[]>()
  const tops: ShellNode[] = []
  for (const n of nodes) {
    if (n.parent_id && byId.has(n.parent_id)) {
      const arr = childrenOf.get(n.parent_id)
      if (arr) arr.push(n); else childrenOf.set(n.parent_id, [n])
    } else tops.push(n)
  }

  // צאצאים מלמטה למעלה: מעבדים לפי דור יורד, בלי רקורסיה
  const stats = new Map<string, SubStat>()
  for (const n of nodes) stats.set(n.id, empty())
  const desc = [...nodes].sort((a, b) => b.generation - a.generation)
  for (const n of desc) {
    if (!n.parent_id) continue
    const p = stats.get(n.parent_id)
    const s = stats.get(n.id)
    if (!p || !s) continue
    p.desc += s.desc + 1
    p.verified += s.verified + (n.status === 'verified' ? 1 : 0)
    p.pending += s.pending + (n.status === 'pending' ? 1 : 0)
    p.rejected += s.rejected + (n.status === 'rejected' ? 1 : 0)
  }

  let root: ShellNode | null = null
  for (const t of tops) {
    if (!root || (stats.get(t.id)?.desc ?? 0) > (stats.get(root.id)?.desc ?? 0)) root = t
  }

  const minGen = root ? root.generation : 1
  const gi = (n: ShellNode) => Math.max(0, n.generation - minGen)
  let maxIdx = 0
  for (const n of nodes) maxIdx = Math.max(maxIdx, gi(n))
  const genTotals = new Array<number>(maxIdx + 1).fill(0)

  const kids = root ? (childrenOf.get(root.id) ?? []) : []
  const sortedKids = [...kids].sort((a, b) => (stats.get(b.id)?.desc ?? 0) - (stats.get(a.id)?.desc ?? 0))
  const trunks: TrunkStat[] = sortedKids.map((node, index) => ({
    node, index,
    color: TRUNK_COLORS[index % TRUNK_COLORS.length],
    stat: stats.get(node.id) ?? empty(),
    children: (childrenOf.get(node.id) ?? []).length,
    byGen: new Array<number>(maxIdx + 1).fill(0),
  }))

  // שיוך כל צומת לגזע שלו, מלמעלה למטה
  const trunkOf = new Map<string, number>()
  trunks.forEach((t, i) => trunkOf.set(t.node.id, i))
  const asc = [...nodes].sort((a, b) => a.generation - b.generation)
  let verified = 0, pending = 0, rejected = 0
  for (const n of asc) {
    genTotals[gi(n)]++
    if (n.status === 'verified') verified++
    else if (n.status === 'pending') pending++
    else if (n.status === 'rejected') rejected++
    if (!trunkOf.has(n.id) && n.parent_id && trunkOf.has(n.parent_id)) trunkOf.set(n.id, trunkOf.get(n.parent_id)!)
    const ti = trunkOf.get(n.id)
    if (ti !== undefined) trunks[ti].byGen[gi(n)]++
  }

  return {
    root, byId, childrenOf, stats, trunks, trunkOf,
    total: nodes.length, verified, pending, rejected,
    maxGen: maxIdx + 1, genTotals,
  }
}

/** שרשרת האבות מהשורש עד הצומת (כולל) */
export function pathTo(id: string, byId: Map<string, ShellNode>): ShellNode[] {
  const out: ShellNode[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return out
}

/** ראשי תיבות לעיגול: בלי "רבי"/"מרת", שתי מילים ראשונות */
export function initials(name: string): string {
  return name
    .replace(/^(רבי|מרת)\s+/, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && w !== 'ומרת')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
}

export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('he-IL'))
