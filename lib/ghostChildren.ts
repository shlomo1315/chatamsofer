// צמתים שנוצרו אוטומטית מאישור משפחה — ולא היו אמורים להיווצר כך.
//
// 🔴 הרקע: syncApprovedFamilyChildren הכניס לעץ את כל ילדי המשפחה שאושרה,
// *כמאומתים*, לפי שדה הילדים בכרטסת. השם שם הוא שם פרטי בודד ("רחל לאה מרים"),
// ולכן בדיקת הכפילות מול האחים לא זיהתה אותו כזהה לצומת הקיים "רבי דוד ומרת
// רחל לאה מרים סינצבנג" — ונוצר עותק שני של אותה אישה. המנהל אישר אדם אחד
// וקיבל שבעה שמות ירוקים חדשים.
//
// המקור תוקן. כאן מזהים את מה שכבר נוצר.
//
// ⚠️ זיהוי בהוכחה ולא בניחוש. שלושה תנאים *יחד*:
//   1. לצומת יש ת"ז
//   2. אין לו כרטסת מקושרת ("אינו רשום עדיין בצאצאים")
//   3. הת"ז שלו מופיעה בשדה הילדים של כרטסת ההורה
//
// התנאי השלישי הוא ההוכחה: הצומת נוצר *מתוך* הרשומה הזאת. בלעדיו זה היה
// היוריסטיקה על שמות, וכלי מחיקה שנשען על היוריסטיקה אינו כלי אלא סיכון.

export interface GhostNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
  id_number?: string | null
}

export interface GhostBen {
  id: string
  lineage_node_id: string | null
  /** שדה הילדים של הכרטסת — משמש כהוכחה */
  children?: unknown
}

/** קבוצת הכרעה. כל אחת מטופלת אחרת, ואין ביניהן חפיפה. */
export type GhostGroup =
  /** יש אח שהשם המלא שלו מכיל את שמו — אותו אדם פעמיים. להסרה. */
  | 'duplicate'
  /** אין תאום, אבל הוא ירוק בלי שאיש אישר. הצומת נשאר, הסטטוס יורד. */
  | 'unapproved'
  /** יש לו ילדים או כרטסת — לא נוגעים בו בשום מקרה. */
  | 'protected'

export interface GhostRow {
  id: string
  name: string
  generation: number
  parentName: string
  status: string
  group: GhostGroup
  /** השם המלא של האח שמכיל אותו — רק ב-duplicate */
  twinName?: string
  /** למה הוא מוגן — רק ב-protected */
  guard?: string
}

const clean = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * האם השם הזה הוא שם פרטי בודד כפי שנשמר בשדה הילדים — כלומר בלי התארים
 * שהעץ מוסיף. סימן תומך בלבד; ההוכחה היא הת"ז.
 */
export function looksLikeChildName(name: string): boolean {
  const n = norm(name)
  if (!n) return false
  return !/^רבי\s/.test(n) && !n.includes(' ומרת ') && !n.includes(' והרבנית ')
}

/**
 * האם שמו של הצומת *מוכל* בשם המלא של אח — כלומר אותו אדם, פעם בשם פרטי
 * ופעם בניסוח המלא.
 *
 * ⚠️ השוואת מילים ולא מחרוזת: "חנה" מוכל ב"חנה רחל" כמחרוזת, אבל אלו שתי
 * נשים שונות. כאן כל מילות השם הקצר חייבות להופיע ברצף בשם הארוך.
 */
export function containedInName(shortName: string, fullName: string): boolean {
  const s = norm(shortName).split(' ').filter(Boolean)
  const f = norm(fullName).split(' ').filter(Boolean)
  if (!s.length || f.length <= s.length) return false
  for (let i = 0; i + s.length <= f.length; i++) {
    if (s.every((w, j) => f[i + j] === w)) return true
  }
  return false
}

/**
 * סורק את העץ ומחזיר את הצמתים שהוכחו כנוצרים מאישור משפחה.
 * קריאה בלבד — אינו כותב דבר.
 */
export function findGhostChildren(
  nodes: GhostNode[],
  bens: GhostBen[],
  /** מזהי הת"ז של הילדים בכרטסת, לפי הצומת שאליו הכרטסת מקושרת */
  childIdsByNode: Map<string, Set<string>>,
): GhostRow[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const nameById = new Map(nodes.map(n => [n.id, n.name]))
  const childCount = new Map<string, number>()
  const siblings = new Map<string, GhostNode[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
    const a = siblings.get(n.parent_id) ?? []
    a.push(n)
    siblings.set(n.parent_id, a)
  }
  const nodesWithBen = new Set(bens.map(b => b.lineage_node_id).filter(Boolean) as string[])

  const out: GhostRow[] = []
  for (const n of nodes) {
    const id = clean(n.id_number)
    if (!id || !n.parent_id) continue
    // ── ההוכחה ──
    if (!childIdsByNode.get(n.parent_id)?.has(id)) continue

    const parentName = nameById.get(n.parent_id) ?? '—'
    const base = { id: n.id, name: n.name, generation: n.generation, parentName, status: n.status ?? 'pending' }

    // ⚠️ מוגן קודם לכל שאר ההכרעות. צומת שצבר ילדים או כרטסת אינו "עותק
    // מיותר" יותר — מחיקתו הייתה מנתקת רשומות אמיתיות שנתלו עליו מאז.
    if (nodesWithBen.has(n.id)) { out.push({ ...base, group: 'protected', guard: 'יש לו כרטסת מקושרת' }); continue }
    if ((childCount.get(n.id) ?? 0) > 0) { out.push({ ...base, group: 'protected', guard: `יש לו ${childCount.get(n.id)} ילדים בעץ` }); continue }

    const twin = (siblings.get(n.parent_id) ?? [])
      .find(s => s.id !== n.id && containedInName(n.name, s.name))
    if (twin) { out.push({ ...base, group: 'duplicate', twinName: twin.name }); continue }

    out.push({ ...base, group: 'unapproved' })
  }
  // מיון יציב: קודם הכפילויות, ואז לפי דור
  const rank: Record<GhostGroup, number> = { duplicate: 0, unapproved: 1, protected: 2 }
  return out.sort((a, b) => rank[a.group] - rank[b.group] || a.generation - b.generation || a.name.localeCompare(b.name, 'he'))
    .filter(r => byId.has(r.id))
}
