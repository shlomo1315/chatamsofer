// ─────────────────────────────────────────────────────────────────────────────
// זיהוי שרשרת הדורות של צאצא מול העץ המאושר — כשאין שיוך לצומת.
//
// הבעיה: השרשרת שנשמרת אצל הצאצא היא *העתק מוקלד*, ובניסוח מורכב — "מרת שמחה
// אשת רבי משה טוביה לעהמאן", "רבי רפאל ורחל דויטש". הצומת בעץ נושא את השם
// בניסוח אחר ("רבי משה טוביה לעהמאן"), ולכן השוואת שם-מול-שם מחזירה "לא נמצא"
// לכל הדורות — וכל מי שנרשם קיבל 5 דורות בכתום ("ממתין לאימות") למרות שהם
// הליבה המאושרת של העץ.
//
// הפתרון: לא לחפש שם בכל העץ, אלא *ללכת* בעץ מהשורש למטה. בכל דור המועמדים הם
// רק ילדיו של הצומת שזוהה בדור הקודם, ולכן התאמה חלקית בשם היא עדות חזקה —
// היא נדרשת להיות עקבית עם כל הרצף שמעליה.
//
// ⚠️ עצירה בדו-משמעות ולא ניחוש: אם לדור מסוים מתאימים שני ילדים או אף אחד,
// ההליכה נעצרת והדורות מכאן והלאה נשארים "לא ידוע". צביעת דור כמאושר על סמך
// ניחוש היא בדיוק הטעות שקשה לגלות, כי היא נראית כמו נתון.
// ─────────────────────────────────────────────────────────────────────────────
import { stripTitles, phoneticKey } from '@/lib/hebrewName'

export interface ResolveNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status?: string | null
}

export interface ChainEntry { generation: number; name: string }

// מילות חיבור שאינן חלק מהשם: "אשת", "בן", "בת", וכן ו' החיבור בראש טוקן
// ("ורחל" → "רחל"). בלעדיהן "רבי רפאל ורחל דויטש" ו-"רבי רפאל דויטש" אינם נפגשים.
const CONNECTIVES = new Set(['אשת', 'בן', 'בת', 'של', 'זוגתו', 'ואשתו', 'אשתו'])

/** טוקנים פונטיים של שם, בלי תארים ובלי מילות חיבור. */
function nameTokens(raw: string): string[] {
  const base = stripTitles(String(raw ?? ''))
    // סוגריים הם הבהרה ("(גרוס)") ולא חלק מהשם המשווה
    .replace(/[()[\]]/g, ' ')
  const out: string[] = []
  for (const rawTok of base.split(/\s+/)) {
    let t = rawTok.trim()
    if (!t) continue
    if (CONNECTIVES.has(t)) continue
    // ו' החיבור בראש טוקן — רק כשנשאר שם של ממש אחריה
    if (t.length > 3 && t.startsWith('ו')) t = t.slice(1)
    if (CONNECTIVES.has(t)) continue
    const k = phoneticKey(t)
    if (k && k.length >= 2) out.push(k)
  }
  return [...new Set(out)]
}

/**
 * התאמה רופפת: כל הטוקנים של השם הקצר מופיעים בשם הארוך.
 *
 * ⚠️ נדרשים לפחות שני טוקנים בשם הקצר. שם בעל טוקן אחד ("משה") מתאים לחצי
 * מהעץ, והתאמה כזו הייתה מזהה את הצומת הלא נכון.
 */
export function nameMatchesLoose(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.length || !tb.length) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (short.length < 2) return false
  return short.every(t => long.includes(t))
}

export interface ResolvedGen {
  nodeId: string
  status: 'verified' | 'pending' | 'rejected'
}

// ⚠️ צומת ללא סטטוס מפורש (null/'') נחשב מאושר — זהה לעץ הוויזואלי
// (`node.status ?? 'verified'`) ולכלל isNodeVerified. אחרת דור שבעץ ✓ ירוק
// היה חוזר כ-pending ומצייר את הצ'יפ כתום.
const statusOf = (n: ResolveNode): ResolvedGen['status'] =>
  n.status === 'rejected' ? 'rejected' : n.status === 'pending' ? 'pending' : 'verified'

/**
 * הליכה בעץ מהשורש לפי השרשרת המוקלדת. מחזירה מפה של הדורות שזוהו בוודאות.
 *
 * דור 1 (השורש) נקבע מהעץ ולא מהשרשרת — הוא החתם סופר, ואינו תלוי בניסוח.
 */
export function resolveChainAgainstTree(
  nodes: ResolveNode[],
  chain: ChainEntry[],
): Map<number, ResolvedGen> {
  const out = new Map<number, ResolvedGen>()
  if (!nodes.length) return out

  // השורש: דור 1. מעדיפים מאושר, כי בעץ תקין יש בדיוק אחד כזה.
  const roots = nodes.filter(n => n.generation === 1)
  const root = roots.find(n => n.status === 'verified') ?? roots[0]
  if (!root) return out
  out.set(1, { nodeId: root.id, status: statusOf(root) })

  // אינדוקס ילדים לפי הורה — כדי לא לסרוק את כל העץ בכל דור
  const childrenOf = new Map<string, ResolveNode[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const arr = childrenOf.get(n.parent_id)
    if (arr) arr.push(n); else childrenOf.set(n.parent_id, [n])
  }

  const byGen = new Map<number, ChainEntry>()
  for (const e of chain) if (e && typeof e.name === 'string') byGen.set(e.generation, e)
  const maxGen = Math.max(...[...byGen.keys()], 1)

  let current = root
  for (let gen = 2; gen <= maxGen; gen++) {
    const entry = byGen.get(gen)
    if (!entry) break
    const kids = childrenOf.get(current.id) ?? []
    let matches = kids.filter(k => nameMatchesLoose(k.name, entry.name))
    // כמה ילדים תואמים — מנסים להכריע לפי צומת מאושר יחיד. יותר מאחד = דו-משמעי.
    if (matches.length > 1) {
      const verified = matches.filter(k => k.status === 'verified')
      if (verified.length === 1) matches = verified
    }
    if (matches.length !== 1) break
    current = matches[0]
    out.set(gen, { nodeId: current.id, status: statusOf(current) })
  }

  return out
}
