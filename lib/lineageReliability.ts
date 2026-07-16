import type { SupabaseClient } from '@supabase/supabase-js'
import { namesMatch, normalizeName, stripTitles } from './hebrewName'

// ─────────────────────────────────────────────────────────────────────────────
// ציון אמינות יוחסין — כלי עזר ייעוצי בלבד.
//
// המטרה: כשמאשרים משפחה חדשה ידנית, לתת "מגמה + ציון" האם קו היוחסין שהיא סימנה
// מתיישב עם כלל העץ סביבו — מבלי להחליט, מבלי לאשר, ומבלי להשפיע על המשפחה.
//
// הרעיון (לפי הדוגמה): לאב מאומת "שמעון סופר" נרשמים כמה בנים. אם נרשמים רבים על
// אותו גזע עם אותה טענה — מגמה אמיתית. אם 10 סימנו "בן של שמעון סופר" ואחד סימן את
// אותו גזע אך עם שם אחר שאיש לא סימן — חריג שכדאי לבדוק.
//
// כל ההשוואות מתעלמות מתארים (הרב/רבי/זצ"ל) ומזהות צליל דומה (ראה hebrewName.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type ReliabilityBand = 'consistent' | 'review' | 'anomaly'

export interface ReliabilityResult {
  ok: boolean
  message?: string
  registrant?: { name: string; status: string }
  claimedPath?: { name: string; generation: number; verified: boolean }[]
  anchor?: { name: string; generation: number } | null
  claimedLine?: string | null            // השם שהנרשם סימן ישירות מתחת לעוגן
  trunkFamilies?: number                  // כמה משפחות חולקות את אותו עוגן
  lineFamilies?: number                   // כמה מהן חולקות גם את אותה שורה (אותו שם מתחת לעוגן)
  siblingLines?: { name: string; count: number }[] // פילוח השורות מתחת לעוגן
  newNodesAdded?: number                  // כמה דורות חדשים/לא-מאומתים הנרשם הוסיף
  score?: number                          // 0–100, ייעוצי
  band?: ReliabilityBand
  label?: string                          // 'אמין' / 'לבדיקה' / 'חריג'
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

const DISCLAIMER = 'ציון ייעוצי בלבד — אינו מאשר ואינו משפיע על המשפחה, רק מסייע לבדיקה הידנית.'
const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור', docs_pending: 'ממתין למסמכים', approved: 'מאושר', rejected: 'נדחה',
}

function bandOf(score: number): { band: ReliabilityBand; label: string } {
  if (score >= 70) return { band: 'consistent', label: 'אמין' }
  if (score >= 40) return { band: 'review', label: 'לבדיקה' }
  return { band: 'anomaly', label: 'חריג' }
}

/** בונה את מפת השם→מספר-משפחות מתוך צ'יין של משפחות שחולקות עוגן, לפי הדור שמתחת לעוגן. */
function tallyUnderAnchor(trunk: Bene[], underGen: number): Map<string, number> {
  const tally = new Map<string, number>()
  for (const b of trunk) {
    const chain = Array.isArray(b.lineage_chain) ? b.lineage_chain : []
    const entry = chain.find(e => e.generation === underGen)
    if (!entry?.name) continue
    const key = normalizeName(entry.name)
    if (!key) continue
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  return tally
}

/**
 * מעריך את אמינות קו היוחסין של משפחה. מחזיר מגמות, מספרים וציון ייעוצי.
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

  // כל צמתי העץ
  const { data: nodeRows, error: nodeErr } = await db
    .from('lineage_nodes')
    .select('id, name, generation, parent_id, status')
  if (nodeErr) return { ok: false, message: 'שגיאה בטעינת עץ הדורות' }
  const nodes = (nodeRows ?? []) as LNode[]
  const byId = new Map(nodes.map(n => [n.id, n]))
  const verifiedNodes = nodes.filter(n => n.status === 'verified')

  // ── בניית הקו שנטען ──
  // מעדיפים lineage_chain; אם חסר — הולכים למעלה מ-lineage_node_id דרך parent_id.
  let path: { name: string; generation: number; verified: boolean }[] = []
  const chain = Array.isArray(ben.lineage_chain) ? ben.lineage_chain : []
  if (chain.length) {
    path = chain
      .slice()
      .sort((a, b) => a.generation - b.generation)
      .map(e => ({
        name: e.name,
        generation: e.generation,
        verified: verifiedNodes.some(n => n.generation === e.generation && namesMatch(n.name, e.name)),
      }))
  } else if (ben.lineage_node_id) {
    let cur: string | null = ben.lineage_node_id
    const up: LNode[] = []
    while (cur) { const n = byId.get(cur); if (!n) break; up.push(n); cur = n.parent_id }
    path = up.reverse().map(n => ({ name: n.name, generation: n.generation, verified: n.status === 'verified' }))
  }

  if (!path.length) {
    return {
      ok: true, registrant, claimedPath: [], anchor: null,
      trunkFamilies: 0, lineFamilies: 0, newNodesAdded: 0,
      score: 0, ...bandOf(0),
      reasons: ['המשפחה לא סימנה קו יוחסין — אין מה להשוות. יש לברר ידנית מול המשפחה.'],
      disclaimer: DISCLAIMER,
    }
  }

  // ── עוגן = הצומת המאומת העמוק ביותר בקו שנטען ──
  const anchorStep = [...path].reverse().find(s => s.verified) ?? null
  const anchor = anchorStep ? { name: anchorStep.name, generation: anchorStep.generation } : null
  const newNodesAdded = path.filter(s => !s.verified).length

  const reasons: string[] = []
  let score = 0
  let claimedLine: string | null = null
  let trunkFamilies = 0
  let lineFamilies = 0
  let siblingLines: { name: string; count: number }[] = []

  if (!anchor) {
    reasons.push('אין אף צומת מאומת בקו שנטען — כל הקו חדש/לא-מאומת. מומלץ לבדוק ידנית מול מקור מוסמך.')
    score = 15
  } else {
    // עומק העוגן בעץ המאומת נותן הקשר: ככל שהעוגן עמוק יותר, יש יותר על מה להישען.
    reasons.push(`עוגן מאומת: "${stripTitles(anchor.name)}" (דור ${anchor.generation}).`)
    score += Math.min(30, anchor.generation * 8)

    // משפחות שחולקות את העוגן (הגזע)
    const canonicalAnchor = verifiedNodes.find(n => n.generation === anchor.generation && namesMatch(n.name, anchor.name))
    const anchorName = canonicalAnchor?.name ?? anchor.name
    const { data: trunkRows } = await db
      .from('beneficiaries')
      .select('id, lineage_chain')
      .contains('lineage_chain', [{ name: anchorName }])
      .limit(500)
    const trunk = (trunkRows ?? []) as Bene[]
    trunkFamilies = trunk.length

    // השורה שהנרשם סימן ישירות מתחת לעוגן
    const underGen = anchor.generation + 1
    const lineStep = path.find(s => s.generation === underGen)
    claimedLine = lineStep ? lineStep.name : null

    const tally = tallyUnderAnchor(trunk, underGen)
    siblingLines = [...tally.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    lineFamilies = claimedLine
      ? [...tally.entries()].filter(([k]) => namesMatch(k, claimedLine!)).reduce((s, [, c]) => s + c, 0)
      : 0

    if (trunkFamilies >= 10) { score += 20; reasons.push(`הגזע מבוסס: ${trunkFamilies} משפחות רשומות על "${stripTitles(anchorName)}".`) }
    else if (trunkFamilies >= 3) { score += 12; reasons.push(`על הגזע "${stripTitles(anchorName)}" רשומות ${trunkFamilies} משפחות.`) }
    else { score += 4; reasons.push(`הגזע "${stripTitles(anchorName)}" עדיין דליל — ${trunkFamilies} משפחות בלבד.`) }

    if (claimedLine) {
      if (lineFamilies >= 3) {
        score += 30
        reasons.push(`השורה שסומנה ("${stripTitles(claimedLine)}") נתמכת ב-${lineFamilies} משפחות נוספות — עקבי.`)
      } else if (lineFamilies === 0 && trunkFamilies >= 8) {
        score -= 15
        reasons.push(`⚠️ חריג: ${trunkFamilies} משפחות על הגזע הזה, אך אף אחת לא סימנה את השורה "${stripTitles(claimedLine)}" שהנרשם טען. כדאי לבדוק.`)
      } else if (lineFamilies <= 1) {
        score += 6
        reasons.push(`השורה "${stripTitles(claimedLine)}" כמעט חדשה (${lineFamilies} תואמות) — ייתכן ענף חדש לגיטימי, אך שווה בדיקה.`)
      } else {
        score += 15
        reasons.push(`השורה "${stripTitles(claimedLine)}" נתמכת ב-${lineFamilies} משפחות.`)
      }
    }
  }

  if (newNodesAdded > 0) {
    score -= Math.min(20, newNodesAdded * 6)
    reasons.push(`הנרשם הוסיף ${newNodesAdded} ${newNodesAdded === 1 ? 'דור חדש' : 'דורות חדשים'} שאינם מאומתים עדיין.`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const { band, label } = bandOf(score)

  return {
    ok: true,
    registrant,
    claimedPath: path,
    anchor,
    claimedLine,
    trunkFamilies,
    lineFamilies,
    siblingLines,
    newNodesAdded,
    score,
    band,
    label,
    reasons,
    disclaimer: DISCLAIMER,
  }
}
