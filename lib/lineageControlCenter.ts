// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקרה לעץ הדורות — חישוב מונים וסקירה משפחה-משפחה.
//
// 🔴 אין כאן כלל חדש. הכפילויות מגיעות מ-findSiblingDuplicates, הכפילויות
// העצמיות מ-findSelfDuplicates וילדי הרפאים מ-findGhostChildren — אותן
// פונקציות שהמסכים הקיימים משתמשים בהן — ולכן המספרים כאן חייבים להתאים להם.
// כאן רק מצלבים אותן מול המשפחות וסופרים.
//
// המודול טהור: מקבל שורות ותוצאות סריקה, ומחזיר סיכום. אין גישה למסד.
// ─────────────────────────────────────────────────────────────────────────────
import type { DupGroup, DupLevel, DupNode } from './lineageDupGroups'
import type { SelfDupRow } from './selfDuplicateNodes'
import type { GhostRow } from './ghostChildren'
import { buildClusters, type ClusterNode, type ClusterRisk } from './mergeClusters'

export type IssueKind =
  | 'unlinked'      // לא מקושרת לצומת בעץ
  | 'dup'           // הצומת שלה בקבוצת כפילות בין אחים
  | 'dup_branch'    // אב קדמון שלה בקבוצת כפילות
  | 'parallel_dup'  // הצומת שלה או אחד האבות שלה הוא עותק כפול מרישום מקביל
  | 'self_dup'      // נתלתה כילד של עצמה
  | 'ghost_card'    // יש צומת רפאים שהוא עותק של הכרטסת שלה
  | 'ghost_child'   // תחת הצומת שלה יש צמתי רפאים
  | 'depth_gap'     // שרשרת הייחוס לא מסתיימת בדור של הצומת
  | 'no_chain'      // אין שרשרת ייחוס שמורה
  | 'node_rejected' // הצומת שלה נדחה

export interface FamilyIssue {
  kind: IssueKind
  label: string
  detail?: string
  /** מי רשאי לטפל: בכפילויות C/D — מנהל בלבד. */
  adminOnly?: boolean
  /** מפתח אשכול הרישום המקביל, למעבר ישיר למיזוג. */
  clusterKey?: string
}

export interface ControlBen {
  id: string
  full_name: string | null
  family_name: string | null
  spouse_name: string | null
  lineage_node_id: string | null
  lineage_chain?: { generation?: number; name?: string }[] | null
  eligibility_status: string | null
  deep_review_reason?: string | null
  lineage_reviewed_at?: string | null
  lineage_reviewed_by?: string | null
}

export interface FamilyReview {
  id: string
  name: string
  status: string
  deepReason: string | null
  nodeId: string | null
  generation: number | null
  /** שמות האבות מהשורש עד הצומת של המשפחה. */
  chain: string[]
  issues: FamilyIssue[]
  ok: boolean
  reviewedAt: string | null
  reviewedBy: string | null
}

export const STATUS_ORDER = ['pending', 'deep_review', 'docs_returned', 'docs_pending', 'approved', 'rejected'] as const

export interface Bucket { total: number; withIssue: number; withDup: number }

export interface ControlSummary {
  families: number
  byStatus: Record<string, Bucket>
  unlinked: number
  reviewedOk: number
  dup: {
    groups: number
    byLevel: Record<DupLevel, number>
    adminOnlyGroups: number
    editorGroups: number
    familiesAffected: number
  }
  selfDup: number
  ghost: { rows: number; familiesAffected: number }
  issueCounts: Record<IssueKind, number>
  parallel: ParallelSummary
}

const ISSUE_LABEL: Record<IssueKind, string> = {
  unlinked: 'לא מקושרת לעץ',
  dup: 'כפילות בין אחים',
  dup_branch: 'כפילות באחד האבות',
  parallel_dup: 'יש עותקים כפולים של האבות שלה',
  self_dup: 'נתלתה כילד של עצמה',
  ghost_card: 'צומת רפאים כפול',
  ghost_child: 'ילדי רפאים',
  depth_gap: 'פער עומק בשרשרת',
  no_chain: 'אין שרשרת ייחוס',
  node_rejected: 'הצומת נדחה',
}
export const issueLabel = (k: IssueKind) => ISSUE_LABEL[k]

const LEVELS: DupLevel[] = ['A', 'B', 'C', 'D']

export function familyName(b: Pick<ControlBen, 'family_name' | 'full_name' | 'spouse_name'>): string {
  return [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ').trim() || 'ללא שם'
}

export function buildControlCenter(input: {
  nodes: DupNode[]
  bens: ControlBen[]
  groups: DupGroup[]
  selfRows: SelfDupRow[]
  ghostRows: GhostRow[]
}): { families: FamilyReview[]; summary: ControlSummary; parallelGroups: ParallelGroup[] } {
  const { nodes, bens, groups, selfRows, ghostRows } = input
  const nodeById = new Map(nodes.map(n => [n.id, n]))

  const groupOfNode = new Map<string, DupGroup>()
  for (const g of groups) for (const id of g.nodeIds) groupOfNode.set(id, g)
  const selfByBen = new Map(selfRows.map(r => [r.benId, r]))
  const ghostCardByBen = new Map<string, GhostRow[]>()
  const ghostChildByBen = new Map<string, GhostRow[]>()
  const push = (m: Map<string, GhostRow[]>, k: string | null, r: GhostRow) => {
    if (!k) return
    const l = m.get(k); if (l) l.push(r); else m.set(k, [r])
  }
  for (const r of ghostRows) { push(ghostCardByBen, r.cardBenId, r); push(ghostChildByBen, r.parentBenId, r) }

  const par = buildParallel(nodes, bens)
  const families: FamilyReview[] = []
  const issueCounts = Object.fromEntries(Object.keys(ISSUE_LABEL).map(k => [k, 0])) as Record<IssueKind, number>
  const byStatus: Record<string, Bucket> = {}
  const affectedByDup = new Set<string>()
  const affectedByGhost = new Set<string>()
  let reviewedOk = 0

  for (const b of bens) {
    const status = b.eligibility_status ?? 'pending'
    const node = b.lineage_node_id ? nodeById.get(b.lineage_node_id) ?? null : null
    const issues: FamilyIssue[] = []
    const add = (kind: IssueKind, detail?: string, adminOnly?: boolean, clusterKey?: string) =>
      issues.push({ kind, label: ISSUE_LABEL[kind], detail, adminOnly, clusterKey })

    // שרשרת האבות מהעץ עצמו (לא מהשדה השמור) — זה מה שהמשפחה רואה.
    const path: DupNode[] = []
    if (node) {
      const seen = new Set<string>()
      for (let cur: DupNode | undefined = node; cur && !seen.has(cur.id); cur = cur.parent_id ? nodeById.get(cur.parent_id) : undefined) {
        seen.add(cur.id); path.unshift(cur)
      }
    }

    if (!node) add('unlinked')
    else {
      const g = groupOfNode.get(node.id)
      if (g) add('dup', `רמה ${g.level}${g.relationConflict ? ', בן/חתן סותרים' : ''}`, g.adminOnly)
      else {
        const anc = path.slice(0, -1).find(p => groupOfNode.has(p.id))
        if (anc) add('dup_branch', anc.name, groupOfNode.get(anc.id)!.adminOnly)
      }
      if (node.status === 'rejected') add('node_rejected')
      const chain = Array.isArray(b.lineage_chain) ? b.lineage_chain : []
      if (!chain.length) add('no_chain')
      else {
        const last = Math.max(...chain.map(c => Number(c?.generation ?? 0)))
        if (last !== Number(node.generation)) add('depth_gap', `שרשרת עד דור ${last}, צומת בדור ${node.generation}`)
      }
    }
    const pk = path.map(p => par.clusterOfNode.get(p.id)).find(Boolean)
    if (pk) add('parallel_dup', par.groups.find(g => g.key === pk)?.name, undefined, pk)
    const self = selfByBen.get(b.id)
    if (self) add('self_dup', self.dupNodeName)
    const gc = ghostCardByBen.get(b.id)
    if (gc?.length) add('ghost_card', `${gc.length} צמתים`)
    const gch = ghostChildByBen.get(b.id)
    if (gch?.length) add('ghost_child', `${gch.length} צמתים`)

    for (const i of issues) issueCounts[i.kind]++
    const hasDup = issues.some(i => i.kind === 'dup' || i.kind === 'dup_branch')
    if (hasDup) affectedByDup.add(b.id)
    if (gc?.length || gch?.length) affectedByGhost.add(b.id)

    const bucket = (byStatus[status] ??= { total: 0, withIssue: 0, withDup: 0 })
    bucket.total++
    if (issues.length) bucket.withIssue++
    if (hasDup) bucket.withDup++
    if (b.lineage_reviewed_at) reviewedOk++

    families.push({
      id: b.id,
      name: familyName(b),
      status,
      deepReason: b.deep_review_reason ?? null,
      nodeId: node?.id ?? null,
      generation: node ? Number(node.generation) : null,
      chain: path.map(p => p.name),
      issues,
      ok: issues.length === 0,
      reviewedAt: b.lineage_reviewed_at ?? null,
      reviewedBy: b.lineage_reviewed_by ?? null,
    })
  }

  const byLevel = Object.fromEntries(LEVELS.map(l => [l, groups.filter(g => g.level === l).length])) as Record<DupLevel, number>
  const adminOnlyGroups = groups.filter(g => g.adminOnly).length
  return {
    families,
    parallelGroups: par.groups,
    summary: {
      families: bens.length,
      byStatus,
      unlinked: issueCounts.unlinked,
      reviewedOk,
      dup: {
        groups: groups.length, byLevel, adminOnlyGroups,
        editorGroups: groups.length - adminOnlyGroups,
        familiesAffected: affectedByDup.size,
      },
      selfDup: selfRows.length,
      ghost: { rows: ghostRows.length, familiesAffected: affectedByGhost.size },
      issueCounts,
      parallel: par.summary,
    },
  }
}

// ── רישום מקביל ──────────────────────────────────────────────────────────────
// הרבה משפחות הוסיפו במקביל את אותם אבות, כל אחת בענף משלה, ולכן אותו אדם
// יושב כמה פעמים תחת הורים שונים. זה לא "הורים שונים = אנשים שונים": שם זהה
// בדיוק באותו דור הוא ראיה חזקה, וההכרעה נעשית באשכולות של מרכז המיזוגים
// (buildClusters — אותו קוד, אותם מספרים). כאן רק מוסיפים הקשר לכל אשכול.

export interface ParallelNode {
  id: string
  parentName: string
  /** כמה משפחות מקושרות לעותק הזה */
  families: number
  children: number
  /** כמה דורות נוספו מתחתיו (עומק תת-העץ) */
  levelsBelow: number
  /** כמה מאבותיו הם בעצמם עותקים כפולים (דורות כפולים מעליו) */
  levelsAbove: number
}

export interface ParallelGroup {
  key: string
  name: string
  generation: number
  nodes: ParallelNode[]
  removable: number
  sameParent: boolean
  risk: ClusterRisk
  /** מיזוג בטוח: אותו אב, שם ודור זהים — אותו כלל של המיזוג הבטוח */
  safe: boolean
  /** כמה משפחות מושפעות (עותק שלהן או של אב שלהן) */
  familiesAffected: number
}

export interface ParallelSummary {
  groups: number
  nodes: number
  removable: number
  safeGroups: number
  safeRemovable: number
  needsDecision: number
  multiCard: number
  familiesAffected: number
  /** גודל העץ היום, ואחרי מיזוג הקבוצות הבטוחות / כולן */
  treeNodes: number
  afterSafe: number
  afterAll: number
}

export function buildParallel(nodes: ClusterNode[], bens: Pick<ControlBen, 'id' | 'lineage_node_id'>[]): {
  groups: ParallelGroup[]
  summary: ParallelSummary
  /** צומת → מפתח אשכול */
  clusterOfNode: Map<string, string>
  /** משפחות מושפעות לפי אשכול */
  familyIdsByCluster: Map<string, Set<string>>
} {
  const childCount = new Map<string, number>()
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  for (const n of nodes) if (n.parent_id) childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  const bensByNode = new Map<string, { id: string; name: string }[]>()
  for (const b of bens) {
    if (!b.lineage_node_id) continue
    const l = bensByNode.get(b.lineage_node_id) ?? []
    l.push({ id: b.id, name: '' }); bensByNode.set(b.lineage_node_id, l)
  }
  const clusters = buildClusters(nodes, childCount, bensByNode)
  const clusterOfNode = new Map<string, string>()
  for (const c of clusters) for (const m of c.members) clusterOfNode.set(m.id, c.key)

  // עומק תת-העץ: מהדור העמוק למעלה
  const depth = new Map<string, number>()
  for (const n of [...nodes].sort((a, b) => b.generation - a.generation)) {
    if (n.parent_id) depth.set(n.parent_id, Math.max(depth.get(n.parent_id) ?? 0, (depth.get(n.id) ?? 0) + 1))
  }
  const above = (id: string) => {
    let c = 0
    const seen = new Set<string>([id])
    for (let p = nodeById.get(id)?.parent_id; p && !seen.has(p); p = nodeById.get(p)?.parent_id) {
      seen.add(p); if (clusterOfNode.has(p)) c++
    }
    return c
  }

  // משפחות מושפעות: הצומת שלהן או אחד האבות שלהן באשכול
  const familyIdsByCluster = new Map<string, Set<string>>()
  for (const b of bens) {
    if (!b.lineage_node_id) continue
    const seen = new Set<string>()
    for (let cur = nodeById.get(b.lineage_node_id); cur && !seen.has(cur.id); cur = cur.parent_id ? nodeById.get(cur.parent_id) : undefined) {
      seen.add(cur.id)
      const k = clusterOfNode.get(cur.id)
      if (k) { const s = familyIdsByCluster.get(k) ?? new Set<string>(); s.add(b.id); familyIdsByCluster.set(k, s) }
    }
  }

  const groups: ParallelGroup[] = clusters.map(c => ({
    key: c.key, name: c.name, generation: c.generation, removable: c.removable,
    sameParent: c.sameParent, risk: c.risk, safe: c.sameParent,
    familiesAffected: familyIdsByCluster.get(c.key)?.size ?? 0,
    nodes: c.members.map(m => ({
      id: m.id,
      parentName: m.parent_id ? (nodeById.get(m.parent_id)?.name ?? '—') : 'שורש',
      families: m.beneficiaryIds.length, children: m.children,
      levelsBelow: depth.get(m.id) ?? 0, levelsAbove: above(m.id),
    })),
  }))

  const affected = new Set<string>()
  for (const s of familyIdsByCluster.values()) for (const id of s) affected.add(id)
  const active = nodes.filter(n => n.status !== 'rejected').length
  const safeRemovable = groups.filter(g => g.safe).reduce((t, g) => t + g.removable, 0)
  const removable = groups.reduce((t, g) => t + g.removable, 0)
  return {
    groups, clusterOfNode, familyIdsByCluster,
    summary: {
      groups: groups.length,
      nodes: groups.reduce((t, g) => t + g.nodes.length, 0),
      removable, safeGroups: groups.filter(g => g.safe).length, safeRemovable,
      needsDecision: groups.filter(g => !g.safe).length,
      multiCard: groups.filter(g => g.risk === 'multi_card').length,
      familiesAffected: affected.size,
      treeNodes: active, afterSafe: active - safeRemovable, afterAll: active - removable,
    },
  }
}

export interface TreeHealth {
  /** 0–100: שיעור המשפחות שאין בהן אף בעיה */
  score: number
  tone: 'ok' | 'warn' | 'bad'
  familiesWithIssue: number
  /** שיעור המשפחות שסומנו "נבדקה, תקין", 0–100 */
  reviewedPct: number
}

/** מד הבריאות של כל העץ, מתוך אותם נתוני מרכז הבקרה. */
export function computeTreeHealth(s: ControlSummary): TreeHealth {
  const total = s.families
  const familiesWithIssue = Math.min(total, Object.values(s.byStatus).reduce((a, b) => a + b.withIssue, 0))
  const score = total > 0 ? Math.round(((total - familiesWithIssue) / total) * 100) : 100
  const reviewedPct = total > 0 ? Math.min(100, Math.round((s.reviewedOk / total) * 100)) : 0
  return { score, tone: score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'bad', familiesWithIssue, reviewedPct }
}
