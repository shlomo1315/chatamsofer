import { describe, it, expect } from 'vitest'
import { pathToRoot, subtreeNodeIds, type TreeNodeRow } from './lineageSync'

// ─────────────────────────────────────────────────────────────────────────────
// הכלל שקובע מי מאושר "לגמרי" בעץ הדורות.
//
// ⚠️ הבאג שהוביל לזה: הסנכרון היה חד-כיווני. אישור משפחה בכרטסת צבע את הצומת
// בעץ, אבל אישור בעץ לא נגע בסטטוס המשפחה — ולכן צומת ירוק נשאר "ממתין
// לאישור" בצאצאים (המקרה של יחיאל חיים טוביאס).
//
// "מאושר לגמרי" אינו "הצומת מאומת" אלא "כל המסלול עד השורש מאומת": די בחוליה
// אחת שאינה מאומתת כדי שהיחוס לא יהיה מוכח.
// ─────────────────────────────────────────────────────────────────────────────

const chainFullyVerified = (nodes: TreeNodeRow[], id: string): boolean => {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const path = pathToRoot(byId, id)
  if (!path.length) return false
  return path.every(n => (n.status ?? 'verified') === 'verified')
}

const node = (id: string, parent: string | null, status: string, gen: number): TreeNodeRow =>
  ({ id, name: id, parent_id: parent, generation: gen, status, relation: null }) as TreeNodeRow

describe('מי מאושר לגמרי בעץ הדורות', () => {
  const tree = [
    node('root', null, 'verified', 1),
    node('a', 'root', 'verified', 2),
    node('b', 'a', 'verified', 3),      // כל המסלול מאומת
    node('c', 'a', 'pending', 3),       // עצמו ממתין
    node('d', 'c', 'verified', 4),      // מאומת אך אביו ממתין
  ]

  it('צומת שכל מסלולו מאומת — מאושר', () => {
    expect(chainFullyVerified(tree, 'b')).toBe(true)
    expect(chainFullyVerified(tree, 'a')).toBe(true)
    expect(chainFullyVerified(tree, 'root')).toBe(true)
  })

  it('צומת שאינו מאומת בעצמו — לא מאושר', () => {
    expect(chainFullyVerified(tree, 'c')).toBe(false)
  })

  it('צומת מאומת עם אב שאינו מאומת — לא מאושר', () => {
    // ⚠️ הבדיקה המרכזית: בלעדיה משפחה הייתה מאושרת על סמך הצומת שלה בלבד,
    // בזמן שהחוליה שמעליה עדיין לא הוכחה — כלומר יחוס לא מוכח שאושר.
    expect(chainFullyVerified(tree, 'd')).toBe(false)
  })

  it('צומת שאינו קיים — לא מאושר', () => {
    expect(chainFullyVerified(tree, 'לא-קיים')).toBe(false)
  })

  it('אישור אב מזכה גם צאצא שכבר היה מאומת וחיכה לו', () => {
    // בדיוק התרחיש שבגללו נבדק כל תת-העץ ולא רק הצומת שאושר.
    const fixed = tree.map(n => (n.id === 'c' ? { ...n, status: 'verified' } : n))
    expect(chainFullyVerified(fixed, 'd')).toBe(true)
    expect([...subtreeNodeIds(fixed, 'c')]).toContain('d')
  })
})
