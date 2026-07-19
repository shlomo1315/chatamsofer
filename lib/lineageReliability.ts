import type { SupabaseClient } from '@supabase/supabase-js'
import { namesMatch, normalizeName, stripTitles } from './hebrewName'

// ─────────────────────────────────────────────────────────────────────────────
// סקירת יוחסין לנרשם — נתונים ומגמות בלבד. אינה קובעת ואינה משנה דבר במשפחה.
//
// המטרה: כשמאשרים משפחה חדשה ידנית, לקבל תמונה עובדתית — עד כמה קו היוחסין שהיא
// סימנה מתיישב עם כלל העץ סביבו: היכן העוגן המאומת, כמה משפחות רשומות על אותו ענף,
// והיכן השורה שסומנה יושבת ביחס לשאר השורות על אותו ענף.
//
// ── ספירה לפי צמתים (מזהים), לא לפי שמות ──
// ספירה לפי מחרוזת השם שברירה (הבדלי תואר/כתיב → 0) — ולכן סופרים לפי מזהי הצמתים
// בעץ: כל משפחה מקושרת לצומת (lineage_node_id). "כמה על הענף" = כמה משפחות בתת-העץ.
// שמות דומים (כפילויות ממתינות) מאוחדים לפי שם מנורמל + צליל (ראה hebrewName.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type ReliabilityBand = 'high' | 'medium' | 'low'

export interface ReliabilityResult {
  ok: boolean
  message?: string
  registrant?: { name: string; status: string }
  claimedPath?: { name: string; generation: number; verified: boolean }[]
  anchor?: { name: string; generation: number } | null
  claimedLine?: string | null
  trunkFamilies?: number
  lineFamilies?: number
  siblingLines?: { name: string; count: number }[]
  newNodesAdded?: number
  score?: number
  band?: ReliabilityBand
  label?: string
  reasons?: string[]
  disclaimer?: string
}

interface LNode { id: string; name: string; generation: number; parent_id: string | null; status: string }
interface ChainEntry { generation: number; name: string; relation?: string | null }
type Bene = {
  id: string; family_name?: string | null; full_name?: string | null; spouse_name?: string | null
  eligibility_status?: string | null; lineage_node_id?: string | null
  lineage_chain?: ChainEntry[] | null
}

const DISCLAIMER = 'נתונים לסקירה בלבד — אינם קובעים ואינם משנים דבר במשפחה.'
const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור', docs_pending: 'ממתין למסמכים', docs_returned: 'הוחזר תיקון — לבדיקה', approved: 'מאושר', rejected: 'נדחה',
}

function bandOf(score: number): { band: ReliabilityBand; label: string } {
  if (score >= 65) return { band: 'high', label: 'התאמה גבוהה' }
  if (score >= 40) return { band: 'medium', label: 'התאמה בינונית' }
  return { band: 'low', label: 'התאמה נמוכה' }
}

/**
 * סוקר את קו היוחסין של משפחה מול כלל העץ. מחזיר מגמות, מספרים וציון התאמה.
 */
export async function assessLineageReliability(db: SupabaseClient, beneficiaryId: string): Promise<ReliabilityResult> {
  const { data: benRaw, error: benErr } = await db
    .from('beneficiaries')
    .select('id, family_name, full_name, spouse_name, eligibility_status, lineage_node_id, lineage_chain')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (benErr) return { ok: false, message: 'שגיאה בטעינת המשפחה' }
  const ben = benRaw as Bene | null
  if (!ben) return { ok: false, message: 'המשפחה לא נמצאה' }

  const regName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '—')
  const registrant = { name: regName, status: STATUS_HE[ben.eligibility_status ?? ''] ?? (ben.eligibility_status ?? '—') }

  // כל צמתי העץ + מפת ילדים
  const { data: nodeRows, error: nodeErr } = await db
    .from('lineage_nodes')
    .select('id, name, generation, parent_id, status')
  if (nodeErr) return { ok: false, message: 'שגיאה בטעינת עץ הדורות' }
  const nodes = (nodeRows ?? []) as LNode[]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const childrenOf = new Map<string, LNode[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const arr = childrenOf.get(n.parent_id) ?? []
    arr.push(n)
    childrenOf.set(n.parent_id, arr)
  }

  // ספירת משפחות לכל צומת (לפי lineage_node_id) — מדויק לפי מזהה
  const { data: famRows } = await db.from('beneficiaries').select('lineage_node_id')
  const familyByNode = new Map<string, number>()
  for (const f of (famRows ?? []) as { lineage_node_id: string | null }[]) {
    if (f.lineage_node_id) familyByNode.set(f.lineage_node_id, (familyByNode.get(f.lineage_node_id) ?? 0) + 1)
  }
  const subtreeFamilies = (rootId: string): number => {
    let total = 0
    const queue = [rootId]
    const seen = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      total += familyByNode.get(id) ?? 0
      for (const c of childrenOf.get(id) ?? []) queue.push(c.id)
    }
    return total
  }

  // ── איתור צומת העלה של הנרשם (leaf) ──
  let leafId: string | null = ben.lineage_node_id ?? null
  if (!leafId) {
    // אין מזהה צומת — מנסים לזהות מהצ'יין לפי הרשומה העמוקה ביותר שמתאימה לצומת
    const chain = Array.isArray(ben.lineage_chain) ? [...ben.lineage_chain].sort((a, b) => b.generation - a.generation) : []
    for (const e of chain) {
      const match = nodes.find(n => n.generation === e.generation && namesMatch(n.name, e.name))
      if (match) { leafId = match.id; break }
    }
  }

  const claimedPath = buildClaimedPath(ben, nodes)

  if (!leafId) {
    return {
      ok: true, registrant, claimedPath, anchor: null,
      trunkFamilies: 0, lineFamilies: 0, siblingLines: [], newNodesAdded: claimedPath.filter(s => !s.verified).length,
      score: 0, ...bandOf(0),
      reasons: ['המשפחה לא סומנה לצומת בעץ הדורות — אין נתוני עץ להשוואה.'],
      disclaimer: DISCLAIMER,
    }
  }

  // ── מסלול הצמתים מהעלה עד השורש ──
  const pathNodes: LNode[] = []
  { let cur: string | null = leafId; const guard = new Set<string>()
    while (cur && !guard.has(cur)) { guard.add(cur); const n = byId.get(cur); if (!n) break; pathNodes.push(n); cur = n.parent_id } }

  // עוגן = הצומת המאומת העמוק ביותר מעל העלה (לא כולל את העלה עצמו)
  const anchorNode = pathNodes.slice(1).find(n => n.status === 'verified')
    ?? pathNodes.find(n => n.status === 'verified')
    ?? null

  const reasons: string[] = []
  let score = 0
  let claimedLine: string | null = null
  let trunkFamilies = 0
  let lineFamilies = 0
  let siblingLines: { name: string; count: number }[] = []
  let newNodesAdded = 0

  if (!anchorNode) {
    reasons.push('אין אף צומת מאומת בקו שנטען — כל הקו חדש ואינו מאומת.')
    score = 15
  } else {
    const anchorName = stripTitles(anchorNode.name)
    reasons.push(`עוגן מאומת: "${anchorName}" (דור ${anchorNode.generation}).`)

    trunkFamilies = subtreeFamilies(anchorNode.id)
    reasons.push(`על הענף המאומת הזה רשומות ${trunkFamilies} ${trunkFamilies === 1 ? 'משפחה' : 'משפחות'}.`)

    // השורה שסומנה = צומת המסלול שהוא ילד ישיר של העוגן
    const anchorIdx = pathNodes.findIndex(n => n.id === anchorNode.id)
    const lineNode = anchorIdx > 0 ? pathNodes[anchorIdx - 1] : null
    claimedLine = lineNode ? lineNode.name : null

    // פילוח השורות מתחת לעוגן — מקבצים ילדים לפי שם מנורמל (מאחד כפילויות ממתינות)
    const groups = new Map<string, { name: string; count: number }>()
    for (const child of childrenOf.get(anchorNode.id) ?? []) {
      const key = normalizeName(child.name) || child.name
      const g = groups.get(key) ?? { name: stripTitles(child.name), count: 0 }
      g.count += subtreeFamilies(child.id)
      groups.set(key, g)
    }
    siblingLines = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8)
    lineFamilies = claimedLine
      ? ([...groups.values()].find(g => namesMatch(g.name, claimedLine!))?.count ?? 0)
      : trunkFamilies

    // דורות חדשים שהנרשם הוסיף = צמתים לא-מאומתים בין העוגן לעלה (לא כולל את העלה עצמו,
    // שהוא תמיד חדש וטבעי לכל נרשם)
    newNodesAdded = pathNodes.filter(n => n.id !== leafId && n.generation > anchorNode.generation && n.status !== 'verified').length

    // ── ציון ──
    score += Math.min(45, trunkFamilies * 6)
    score += Math.min(15, anchorNode.generation * 3)
    if (lineFamilies >= 3) score += 15
    if (newNodesAdded === 0) score += 15
    score -= Math.min(25, newNodesAdded * 10)

    const topSibling = siblingLines[0]?.count ?? 0
    const uniqueLineUnderPopulated = newNodesAdded >= 1 && trunkFamilies >= 8 && lineFamilies <= 1 && topSibling >= 3
    if (uniqueLineUnderPopulated) score -= 25

    // ── נימוקים עובדתיים (בלי המלצות) ──
    if (claimedLine) {
      if (lineFamilies >= 3) {
        reasons.push(`השורה שסומנה ("${stripTitles(claimedLine)}") משותפת ל-${lineFamilies} משפחות.`)
      } else if (uniqueLineUnderPopulated) {
        reasons.push(`השורה שסומנה ("${stripTitles(claimedLine)}") ייחודית — אף משפחה אחרת אינה רשומה עליה, בעוד שורות אחרות על אותו ענף מגיעות עד ${topSibling} משפחות.`)
      } else {
        reasons.push(`השורה שסומנה ("${stripTitles(claimedLine)}") רשומה ל-${lineFamilies} ${lineFamilies === 1 ? 'משפחה' : 'משפחות'}.`)
      }
    }
    if (newNodesAdded > 0) {
      reasons.push(`נוספו ${newNodesAdded} ${newNodesAdded === 1 ? 'דור חדש' : 'דורות חדשים'} מעל הנרשם שאינם מאומתים בעץ.`)
    } else {
      reasons.push('הנרשם חובר ישירות לצומת מאומת בעץ, בלי הוספת דורות חדשים.')
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const { band, label } = bandOf(score)

  return {
    ok: true, registrant, claimedPath,
    anchor: anchorNode ? { name: anchorNode.name, generation: anchorNode.generation } : null,
    claimedLine, trunkFamilies, lineFamilies, siblingLines, newNodesAdded,
    score, band, label, reasons, disclaimer: DISCLAIMER,
  }
}

/** בונה את הקו שנטען (לתצוגה) — מהצ'יין אם קיים, אחרת מהליכה למעלה מ-lineage_node_id. */
function buildClaimedPath(ben: Bene, nodes: LNode[]): { name: string; generation: number; verified: boolean }[] {
  const verified = nodes.filter(n => n.status === 'verified')
  const chain = Array.isArray(ben.lineage_chain) ? ben.lineage_chain : []
  if (chain.length) {
    return [...chain].sort((a, b) => a.generation - b.generation).map(e => ({
      name: e.name, generation: e.generation,
      verified: verified.some(n => n.generation === e.generation && namesMatch(n.name, e.name)),
    }))
  }
  if (ben.lineage_node_id) {
    const byId = new Map(nodes.map(n => [n.id, n]))
    let cur: string | null = ben.lineage_node_id
    const up: LNode[] = []
    const guard = new Set<string>()
    while (cur && !guard.has(cur)) { guard.add(cur); const n = byId.get(cur); if (!n) break; up.push(n); cur = n.parent_id }
    return up.reverse().map(n => ({ name: n.name, generation: n.generation, verified: n.status === 'verified' }))
  }
  return []
}
