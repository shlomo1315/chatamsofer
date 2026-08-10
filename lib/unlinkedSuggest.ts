// נרשמים שאין להם שיוך לעץ הדורות — ומה אפשר להציע להם.
//
// 🔴 למה הם קיימים: lineage_node_id הוא ההצבעה של הכרטסת לצומת בעץ. בלעדיו אין
// לנרשם מקום להיתלות עליו, וההשלמה האוטומטית אינה יכולה לעזור לו — אין אב.
//
// אבל רובם *לא* חסרי מידע. בטופס הרישום נשמרת גם lineage_chain — שרשרת הדורות
// שהנרשם עצמו הזין. אם היא קיימת, אפשר לחפש את הדורות שלה בעץ ולהציע למנהל את
// הצומת העמוק ביותר שכן נמצא, במקום להשאיר אותו לחפש ידנית.
//
// ⚠️ הצעה בלבד. השיוך נשאר לחיצה של המנהל — הצבעה שגויה מעבירה אדם לענף
// אחר לגמרי, וזו לא החלטה שמכונה מקבלת לבד.
import { autoMergeKey } from './lineageMerge'

export interface UnlinkedBen {
  id: string
  id_number?: string | null
  full_name?: string | null
  spouse_name?: string | null
  family_name?: string | null
  email?: string | null
  phone?: string | null
  created_at?: string | null
  lineage_chain?: unknown
}

export interface TreeNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
}

export interface ChainEntry { generation: number; name: string }

export interface Suggestion {
  nodeId: string
  nodeName: string
  generation: number
  /** הדור בשרשרת שממנו הגיעה ההתאמה — כדי שהמנהל יראה *למה* הוצע. */
  matchedGeneration: number
  /** כמה דורות מתוך השרשרת שלו נמצאו בעץ — מדד ביטחון גס. */
  matchedDepth: number
  /** יותר מצומת אחד בשם הזה — צריך עין אנושית, לא לחיצה עיוורת. */
  ambiguous: boolean
}

export interface UnlinkedRow {
  id: string
  name: string
  idNumber: string | null
  email: string | null
  phone: string | null
  createdAt: string | null
  chainLength: number
  /** הדור האחרון שהנרשם הזין — מה שהוא חושב שהוא, גם אם לא נמצא בעץ. */
  chainTail: string
  suggestion: Suggestion | null
}

/** שרשרת הייחוס כפי שנשמרה, ממוינת לפי דור. */
export function readChain(raw: unknown): ChainEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(e => {
      const o = e as { generation?: unknown; name?: unknown }
      return { generation: Number(o?.generation ?? 0), name: String(o?.name ?? '').trim() }
    })
    .filter(e => e.name)
    .sort((a, b) => a.generation - b.generation)
}

export function benDisplayName(b: UnlinkedBen): string {
  const person = [b.full_name, b.spouse_name].filter(Boolean).join(' ו')
  return [person, b.family_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || '(ללא שם)'
}

/**
 * מציע צומת לשיוך, לפי השרשרת שהנרשם עצמו הזין.
 *
 * הולכים מהדור *העמוק ביותר* כלפי מעלה ועוצרים בהתאמה הראשונה: ככל שהצומת
 * עמוק יותר, כך השיוך מדויק יותר. התאמה בדור 3 היא כמעט חסרת ערך — היא
 * מציבה את הנרשם ישירות תחת אב-קדמון ומוחקת את כל הדורות שביניהם.
 *
 * ⚠️ שם שמופיע פעמיים בעץ מסומן ambiguous ולא נבחר בשבילו: בחירה שרירותית
 * בין שני צמתים בעלי אותו שם היא בדיוק הטעות שמעבירה אדם לענף זר.
 */
export function suggestNode(chain: ChainEntry[], byName: Map<string, TreeNode[]>): Suggestion | null {
  let matchedDepth = 0
  for (const e of chain) if ((byName.get(autoMergeKey(e.name))?.length ?? 0) > 0) matchedDepth++

  for (let i = chain.length - 1; i >= 0; i--) {
    const hits = byName.get(autoMergeKey(chain[i].name))
    if (!hits?.length) continue
    return {
      nodeId: hits[0].id,
      nodeName: hits[0].name,
      generation: hits[0].generation,
      matchedGeneration: chain[i].generation,
      matchedDepth,
      ambiguous: hits.length > 1,
    }
  }
  return null
}

export function indexNodesByName(nodes: TreeNode[]): Map<string, TreeNode[]> {
  const m = new Map<string, TreeNode[]>()
  for (const n of nodes) {
    const k = autoMergeKey(n.name)
    if (!k) continue
    const list = m.get(k)
    if (list) list.push(n); else m.set(k, [n])
  }
  return m
}

export function buildUnlinkedRows(bens: UnlinkedBen[], nodes: TreeNode[]): UnlinkedRow[] {
  const byName = indexNodesByName(nodes)
  return bens.map(b => {
    const chain = readChain(b.lineage_chain)
    return {
      id: b.id,
      name: benDisplayName(b),
      idNumber: b.id_number ?? null,
      email: b.email ?? null,
      phone: b.phone ?? null,
      createdAt: b.created_at ?? null,
      chainLength: chain.length,
      chainTail: chain.length ? chain[chain.length - 1].name : '',
      suggestion: suggestNode(chain, byName),
    }
  })
}
