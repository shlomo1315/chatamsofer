// ─────────────────────────────────────────────────────────────────────────────
// מסך "המאושרים בעץ" — הלוגיקה הטהורה (סיווג שמות, סדר אב-לפני-ילד).
//
// ⚠️ הקובץ משותף ללקוח ולשרת בכוונה: התצוגה המקדימה בחלון ההוספה והשמירה
// בשרת חייבות לסווג בדיוק אותו דבר, אחרת מה שהמנהל ראה אינו מה שנשמר.
// ⚠️ "מאושר" = שורה ב-lineage_approved_ref (מקור האמת לצבע בכל הכרטסות).
// "ממתין" = צומת בעץ בדורות 1–5 שאינו שם.
// ─────────────────────────────────────────────────────────────────────────────
import { coupleKey, buildApprovedRefTree } from './lineageApprovedRef'

/** כמה דורות מוצגים בחלון אחד (העץ נטען בחלקים). */
export const WINDOW_GENS = 5
/** תקרת שפיות לדור שאפשר להוסיף. */
export const MAX_GEN_LIMIT = 80

export interface ApprovedTreeNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  ok: boolean
  /** רק בעמודה הראשונה של חלון שאינו מתחיל בדור 1: האב מחוץ לחלון, וזה מצבו. */
  parent_ok?: boolean
}

/** נרמול השוואה — כמו במוקאפ שאושר: בלי תארים, "זי"ע" ופיסוק. */
export function normForMatch(s: string): string {
  return String(s ?? '')
    .replace(/זי"ע|זצ"ל|זי״ע|זצ״ל/g, '')
    .replace(/["'׳״.,·\-]/g, ' ')
    .replace(/(^|\s)(רבי|מרן|ומרת|מרת)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sameApproved(a: string, b: string): boolean {
  const na = normForMatch(a), nb = normForMatch(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if ((na.length > 5 && nb.includes(na)) || (nb.length > 5 && na.includes(nb))) return true
  // "רבי יעקב ומרת חיה קרויס" מול "רבי יעקב קרויס" — אותו בעל ואותו שם משפחה.
  const ca = coupleKey(a)
  return !!ca && ca === coupleKey(b)
}

/** האם הצומת יכול לקבל אישור עכשיו: לא מאושר, ואביו מאושר (ילד לא לפני האב). */
export function canApprove(node: ApprovedTreeNode, byId: Map<string, ApprovedTreeNode>): boolean {
  if (node.ok || !node.parent_id) return false
  return !!byId.get(node.parent_id)?.ok
}

export const isBlocked = canApprove

export type LineKind = 'found' | 'new' | 'red' | 'skip'
export interface LineResult { kind: LineKind; label: string; nodeId?: string }

const shortName = (n: string) => {
  const i = n.indexOf(' · ')
  return i < 0 ? n : n.slice(i + 3)
}

/**
 * מסווג שורות שהודבקו לחלון ההוספה, לפי דור ואב.
 * מחזיר null לשורה ריקה. שורה כפולה בתוך אותה הדבקה נדלגת.
 */
export function classifyLines(
  lines: string[], nodes: ApprovedTreeNode[], generation: number, parentId: string | null,
): (LineResult | null)[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const seen: string[] = []
  return lines.map(raw => {
    const line = raw.trim()
    if (!normForMatch(line)) return null
    if (seen.some(s => sameApproved(s, line))) return { kind: 'skip', label: 'מופיע פעמיים ברשימה · ידולג' }
    seen.push(line)

    const m = nodes.filter(x => sameApproved(x.name, line))
    const sg = m.find(x => x.generation === generation && x.parent_id === parentId)
    if (sg) {
      return sg.ok
        ? { kind: 'skip', label: 'כבר מאושר · ידולג' }
        : { kind: 'found', label: 'נמצא בעץ · יאושר', nodeId: sg.id }
    }
    const og = m.find(x => x.generation === generation)
    if (og) {
      const pn = og.parent_id ? shortName(byId.get(og.parent_id)?.name ?? '') : ''
      return og.ok
        ? { kind: 'skip', label: `כבר מאושר תחת ${pn} · ידולג` }
        : { kind: 'red', label: `בעץ תחת ${pn} · לבדוק` }
    }
    if (m.length) return { kind: 'red', label: `קיים בדור ${m[0].generation} · לבדוק` }
    return { kind: 'new', label: 'חדש · ייווצר בעץ' }
  })
}

export interface RefRowLite { key: string; name: string; generation: number; parent_key: string | null }

/**
 * מחשב לכל צומת אם הוא בקובץ המאושר — בדיוק לפי אותו בודק שצובע ירוק בכרטסות
 * (buildApprovedRefTree), כדי שהמסך והכרטסות לא יחלקו על מי מאושר.
 */
export function computeApproved(
  nodes: { id: string; name: string; generation: number; parent_id: string | null }[],
  refs: RefRowLite[],
): ApprovedTreeNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const lookup = buildApprovedRefTree(refs)
  return nodes.map(n => {
    const parentName = n.parent_id ? (byId.get(n.parent_id)?.name ?? null) : null
    const ok = !n.parent_id || lookup(n.name, n.generation, parentName) // השורש תמיד מאושר
    return { id: n.id, name: n.name, generation: n.generation, parent_id: n.parent_id, ok }
  })
}

/** מפתח שורת הייחוס של צומת מאושר (לשמש כ-parent_key של ילד חדש). */
export function refKeyOf(
  node: { name: string; generation: number },
  parentName: string | null, refs: RefRowLite[],
): string | null {
  const byKey = new Map(refs.map(r => [r.key, r]))
  const hit = refs.find(r => {
    if (r.generation !== node.generation) return false
    const p = r.parent_key ? byKey.get(r.parent_key) : undefined
    return buildApprovedRefTree(p ? [r, p] : [r])(node.name, node.generation, node.generation <= 2 ? null : parentName)
  })
  return hit?.key ?? null
}
