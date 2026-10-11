// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כלל אחד לזיהוי כפילויות בעץ הדורות (12.10).
//
// עד היום היו חמישה כלים, ולכל אחד כלל משלו (שם מילולי / דמיון / נרמול
// תארים / בלי הורה משותף). אותו זוג היה "כפול" במסך אחד ו"תקין" באחר, והכרעת
// "לא כפול" לא נשמרה — ולכן אותם מקרים חזרו שוב ושוב.
//
// הכלל: כפילות = *אחים* (אותו הורה) עם אותו בעל + שם משפחה (coupleKey).
// הורים שונים = אנשים שונים (נכד שנקרא על שם סבו) — לעולם לא מוצעים כאן.
//
// הרמה קובעת מי רשאי להכריע (החלטת המשתמש 12.10):
//   A — זהה אחרי נרמול ("ומרת" מול "ו")          → כל בעל הרשאת עריכה
//   B — אישה חסרה בצד אחד                          → כל בעל הרשאת עריכה
//   C — שם אישה חלקי ("רחל" מול "חוה רחל")          → מנהל בלבד
//   D — שני שמות אישה שונים (כתיב או נישואים שניים) → מנהל בלבד
//   בן/חתן סותרים — מנהל בלבד, בכל רמה.
// ─────────────────────────────────────────────────────────────────────────────
import { coupleKey } from './lineageApprovedRef'
import { normalizeName } from './lineageChainDiff'
import { lineageIdentityKey, stripTitles } from './lineageNameFormat'

export type DupLevel = 'A' | 'B' | 'C' | 'D'

export interface DupNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string | null
  relation: string | null
}

export interface DupGroup {
  /** מפתח יציב לקבוצה — המזהים ממוינים. */
  key: string
  parentId: string | null
  generation: number
  level: DupLevel
  relationConflict: boolean
  adminOnly: boolean
  nodeIds: string[]
  keepId: string
  /** השם המלא — עם האישה, אם יש (החלטת המשתמש). */
  suggestedName: string
}

/** מפתח זוג ממוין — כמו ב-lineage_not_duplicates. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** שם האישה מתוך שם הצומת ("רבי משה ומרת מלכה פריי" → "מלכה"). */
export function wifeName(raw: string): string {
  const s = normalizeName(stripTitles(raw)).replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
  const w = s.split(' ').filter(Boolean)
  if (w.length < 3) return ''
  const given = w.slice(0, -1)
  const at = given.findIndex((x, i) => i > 0 && (x === 'ומרת' || /^ו/.test(x)))
  if (at < 0) return ''
  let rest = given.slice(at)
  if (rest[0] === 'ומרת') rest = rest.slice(1)
  else rest = [rest[0].replace(/^ו/, ''), ...rest.slice(1)]
  if (rest[0] === 'מרת') rest = rest.slice(1)
  return rest.join(' ').trim()
}

function levelOf(group: DupNode[]): DupLevel {
  if (new Set(group.map(g => lineageIdentityKey(g.name))).size === 1) return 'A'
  const wives = [...new Set(group.map(g => wifeName(g.name)).filter(Boolean))]
  if (wives.length <= 1) return 'B'
  const compatible = wives.every(a => wives.every(b => a === b || a.includes(b) || b.includes(a)))
  return compatible ? 'C' : 'D'
}

/**
 * הקבוצות הכפולות בין אחים.
 * @param notDup  זוגות שהוכרעו "לא כפול" (pairKey) — קבוצה שכל זוגותיה הוכרעו נעלמת.
 * @param extra   נתוני עזר לבחירת השורד (מספר משפחות/ילדים לכל צומת).
 */
export function findSiblingDuplicates(
  nodes: DupNode[],
  notDup: Set<string> = new Set(),
  extra: { bens?: Map<string, number>; kids?: Map<string, number> } = {},
): DupGroup[] {
  const buckets = new Map<string, DupNode[]>()
  for (const n of nodes) {
    if (n.status === 'rejected' || !n.parent_id) continue
    const k = coupleKey(n.name) || normalizeName(n.name)
    if (!k) continue
    const key = `${n.parent_id}|${k}`
    const b = buckets.get(key)
    if (b) b.push(n); else buckets.set(key, [n])
  }

  const out: DupGroup[] = []
  for (const group of buckets.values()) {
    if (group.length < 2) continue
    // ⚠️ "לא כפול" — רק כשכל הזוגות בקבוצה הוכרעו. צומת שלישי שנוסף אחר כך
    // מחזיר את הקבוצה, כי מולו טרם הוכרע דבר.
    let open = false
    for (let i = 0; i < group.length && !open; i++)
      for (let j = i + 1; j < group.length; j++)
        if (!notDup.has(pairKey(group[i].id, group[j].id))) { open = true; break }
    if (!open) continue

    const level = levelOf(group)
    const rels = new Set(group.map(g => g.relation).filter(Boolean))
    const relationConflict = rels.size > 1
    const score = (g: DupNode) => [
      g.status === 'verified' ? 1 : 0,
      extra.bens?.get(g.id) ?? 0,
      extra.kids?.get(g.id) ?? 0,
    ]
    const sorted = group.slice().sort((a, b) => {
      const sa = score(a), sb = score(b)
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i]
      return a.id.localeCompare(b.id)
    })
    // השם המלא: עם אישה קודם, ואז הארוך ביותר; בשוויון — של השורד.
    const named = group.slice().sort((a, b) => {
      const wa = wifeName(a.name) ? 1 : 0, wb = wifeName(b.name) ? 1 : 0
      if (wa !== wb) return wb - wa
      if (a.name.length !== b.name.length) return b.name.length - a.name.length
      return a.id === sorted[0].id ? -1 : b.id === sorted[0].id ? 1 : 0
    })
    const ids = group.map(g => g.id).sort()
    out.push({
      key: ids.join(','),
      parentId: group[0].parent_id,
      generation: group[0].generation,
      level,
      relationConflict,
      adminOnly: level === 'C' || level === 'D' || relationConflict,
      nodeIds: ids,
      keepId: sorted[0].id,
      suggestedName: named[0].name,
    })
  }
  // מלמעלה למטה: מיזוג הורים קודם הופך את ילדיהם לאחים (המפל).
  return out.sort((a, b) => a.generation - b.generation || a.level.localeCompare(b.level))
}
