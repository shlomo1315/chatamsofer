// ─────────────────────────────────────────────────────────────────────────────
// עריכה מלאה של סדר הדורות — פעולות טהורות, משותפות לכרטסת, לקישור התיקון
// ולשרת.
//
// 🔴 הדור נגזר מהמיקום ברשימה (שורה 0 = דור 1). אין "רווח" במספור: בעץ הדור
// נגזר מהאב, ולכן דור שנמחק עם "השארת המקום" נשאר כשורה ריקה שחייבים למלא
// לפני השמירה.
//
// ⚠️ דור 1 (רבינו החתם סופר) קבוע — אינו נערך, נמחק או זז.
// ─────────────────────────────────────────────────────────────────────────────

export type ChainRelation = 'son' | 'son_in_law' | null
export interface EditRow { name: string; relation: ChainRelation }
export interface ChainStep { generation: number; name: string; relation: ChainRelation }

export const ROOT_NAME = 'רבינו החתם סופר'
export const MAX_EDIT_GENERATIONS = 40
export const MAX_GEN_NAME = 120

export const rel = (r: unknown): ChainRelation => (r === 'son' || r === 'son_in_law' ? r : null)

const ROOT: EditRow = { name: ROOT_NAME, relation: null }

/** שרשרת שמורה → שורות לעריכה. דורות חסרים באמצע הופכים לשורות ריקות. */
export function rowsFromChain(chain: { generation?: number | null; name?: string | null; relation?: unknown }[] | null | undefined): EditRow[] {
  const byGen = new Map<number, EditRow>()
  for (const c of chain ?? []) {
    const g = Number(c?.generation)
    const name = String(c?.name ?? '').trim()
    if (!Number.isInteger(g) || g < 2 || g > MAX_EDIT_GENERATIONS || !name || byGen.has(g)) continue
    byGen.set(g, { name, relation: rel(c.relation) })
  }
  const last = Math.max(1, ...byGen.keys())
  const rows: EditRow[] = [{ ...ROOT }]
  for (let g = 2; g <= last; g++) rows.push(byGen.get(g) ?? { name: '', relation: null })
  return rows
}

export function chainFromRows(rows: EditRow[]): ChainStep[] {
  return rows.map((r, i) => i === 0
    ? { generation: 1, name: ROOT_NAME, relation: null }
    : { generation: i + 1, name: r.name.trim(), relation: r.relation })
}

export function updateRow(rows: EditRow[], i: number, patch: Partial<EditRow>): EditRow[] {
  if (i <= 0 || i >= rows.length) return rows
  return rows.map((r, k) => (k === i ? { ...r, ...patch } : r))
}

/** הוספת דור במקום at (הדורות מ-at ואילך יורדים דור). בלי row — שורה ריקה. */
export function insertRow(rows: EditRow[], at: number, row?: EditRow): EditRow[] {
  if (rows.length >= MAX_EDIT_GENERATIONS) return rows
  const pos = Math.min(Math.max(at, 1), rows.length)
  const add: EditRow = row ? { name: row.name.trim().slice(0, MAX_GEN_NAME), relation: rel(row.relation) } : { name: '', relation: null }
  return [...rows.slice(0, pos), add, ...rows.slice(pos)]
}

export interface TreeNode { id: string; name: string; generation: number; parent_id: string | null; status?: string | null; relation?: string | null }

export const normGenName = (s: string) => String(s ?? '').replace(/["'`׳״]/g, '').replace(/\s+/g, ' ').trim()

/**
 * "דור קיים מאותו גזע": הילדים בעץ (בדור gen) של הצמתים בדור הקודם ששמם
 * כשם הדור הקודם בשרשרת. בדור 2 — כל צמתי הדור (כולם בני רבינו).
 * צמתים שנדחו לא מוצעים, ושמות כפולים מוצגים פעם אחת.
 */
export function treeChildrenOf(nodes: TreeNode[], prevName: string, gen: number): TreeNode[] {
  const live = nodes.filter(n => n.status !== 'rejected')
  let kids = live.filter(n => n.generation === gen)
  if (gen > 2) {
    const want = normGenName(prevName)
    if (!want) return []
    const parents = new Set(live.filter(n => n.generation === gen - 1 && normGenName(n.name) === want).map(n => n.id))
    kids = kids.filter(n => n.parent_id !== null && parents.has(n.parent_id))
  }
  const seen = new Set<string>()
  return kids
    .filter(n => { const k = normGenName(n.name); if (!k || seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
}

export type RemoveMode = 'shift' | 'keep'

/**
 * מחיקת דור.
 *   shift — הדורות שאחריו עולים דור (סוגרים את המקום).
 *   keep  — הדורות שאחריו נשארים במקומם, והמקום נשאר ריק למילוי.
 * ⚠️ בדור האחרון אין מה להשאיר — נמחק תמיד.
 */
export function removeRow(rows: EditRow[], i: number, mode: RemoveMode): EditRow[] {
  if (i <= 0 || i >= rows.length) return rows
  if (mode === 'keep' && i < rows.length - 1) return updateRow(rows, i, { name: '', relation: null })
  return rows.filter((_, k) => k !== i)
}

/** הזזת דור מעלה (-1) או מטה (+1). דור 1 קבוע ולא מוחלף. */
export function moveRow(rows: EditRow[], i: number, dir: -1 | 1): EditRow[] {
  const j = i + dir
  if (i <= 0 || j <= 0 || i >= rows.length || j >= rows.length) return rows
  const out = [...rows]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** אינדקסים של שורות שעדיין ריקות (צריך למלא לפני שמירה). */
export function emptyRows(rows: EditRow[]): number[] {
  return rows.flatMap((r, i) => (i > 0 && !r.name.trim() ? [i] : []))
}

// 🔴 A6 (18.11): "gyhk rcev" נשמר בדור 8 אצל זלצמן — עברית שהוקלדה במקלדת
// אנגלית. שמות בדורות בעברית בלבד; נאכף בכל מסלולי השמירה בשרת.
const LATIN = /[a-z]/i

/** הודעת שגיאה לשם דור עם אותיות לועזיות, או null כשהשם תקין. */
export function latinNameError(name: unknown, generation: number): string | null {
  return typeof name === 'string' && LATIN.test(name)
    ? `השם בדור ${generation} ("${name.trim()}") כתוב באותיות לועזיות. יש לכתוב בעברית בלבד (אולי המקלדת על אנגלית?).`
    : null
}

/** השגיאה הראשונה בשרשרת שיש בה שם לועזי, או null. */
export function latinChainError(chain: unknown): string | null {
  if (!Array.isArray(chain)) return null
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i] as { name?: unknown; generation?: unknown } | null
    const err = latinNameError(c?.name, Number(c?.generation) || i + 1)
    if (err) return err
  }
  return null
}

export type SanitizeResult = { ok: true; chain: ChainStep[] } | { ok: false; error: string }

/**
 * אימות שרשרת שהגיעה מהדפדפן — בשרת, לפני כל כתיבה.
 * הדור נקבע לפי המיקום, לא לפי מה שנשלח.
 */
export function sanitizeEditedChain(raw: unknown, max = MAX_EDIT_GENERATIONS): SanitizeResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'סדר הדורות חסר' }
  const sorted = [...raw]
    .filter(c => c && typeof c === 'object')
    .sort((a, b) => Number(a.generation) - Number(b.generation))
  const rest = sorted.filter(c => Number(c.generation) !== 1)
  if (!rest.length) return { ok: false, error: 'יש להוסיף לפחות דור אחד אחרי רבינו החתם סופר' }
  if (rest.length + 1 > max) return { ok: false, error: `אפשר עד ${max} דורות` }
  const chain: ChainStep[] = [{ generation: 1, name: ROOT_NAME, relation: null }]
  for (const c of rest) {
    const name = String(c.name ?? '').replace(/\s+/g, ' ').trim()
    if (!name) return { ok: false, error: `דור ${chain.length + 1} ריק — יש למלא שם או למחוק אותו` }
    if (name.length > MAX_GEN_NAME) return { ok: false, error: `השם בדור ${chain.length + 1} ארוך מדי` }
    const latin = latinNameError(name, chain.length + 1)
    if (latin) return { ok: false, error: latin }
    chain.push({ generation: chain.length + 1, name, relation: rel(c.relation) })
  }
  return { ok: true, chain }
}
