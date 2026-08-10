// ⚠️ הבדיקה המרכזית כאן היא אחת: **אף צומת לא נעלם**.
//
// זה הבאג שדווח מהשטח — "יש צאצאים שרשומים במערכת ולא מופיעים בעץ בשום מקום".
// buildTree הקודם צירף כל צומת להורה שלו והוסיף לשורשים רק צמתים בלי הורה,
// ולכן צומת בתוך מעגל (או שהוא ההורה של עצמו) לא הגיע לשורשים ולא צויֵיר —
// הוא וכל תת-העץ שמתחתיו. מעגלים נוצרים ממיזוג כפילויות, שמסיט הורות בהמוניה.
import { describe, it, expect } from 'vitest'
import { buildForest, countForest } from './lineageForest'

type N = { id: string; parent_id: string | null; name?: string }
const n = (id: string, parent_id: string | null): N => ({ id, parent_id, name: id })

describe('buildForest — כל צומת מופיע בעץ', () => {
  it('עץ תקין נבנה כמצופה', () => {
    const flat = [n('a', null), n('b', 'a'), n('c', 'a'), n('d', 'b')]
    const f = buildForest(flat)

    expect(f.roots.map(r => r.id)).toEqual(['a'])
    expect(countForest(f.roots)).toBe(4)
    expect(f.detached).toEqual([])
    expect(f.selfParented).toEqual([])
    expect(f.danglingParent).toEqual([])
  })

  it('הורה שנמחק — הצומת הופך לשורש ואינו נעלם', () => {
    // התרחיש: הצומת האב נמחק במיזוג, והילד נשאר מצביע אליו.
    const flat = [n('a', null), n('b', 'a'), n('orphan', 'deleted-id'), n('kid', 'orphan')]
    const f = buildForest(flat)

    expect(countForest(f.roots)).toBe(4)
    expect(f.danglingParent).toEqual(['orphan'])
    expect(f.roots.map(r => r.id).sort()).toEqual(['a', 'orphan'])
    // הצאצא של היתום נשאר תלוי בו ולא נעלם
    const orphan = f.roots.find(r => r.id === 'orphan')!
    expect(orphan.children.map(c => c.id)).toEqual(['kid'])
  })

  it('🔴 מעגל של שניים — שני הצמתים וצאצאיהם מופיעים ולא נעלמים', () => {
    // A הורה של B ו-B הורה של A. קודם: אף אחד מהם לא היה שורש, ולכן שניהם
    // וכל מה שמתחתיהם לא צויירו בשום מקום.
    const flat = [n('root', null), n('a', 'b'), n('b', 'a'), n('childOfA', 'a')]
    const f = buildForest(flat)

    expect(countForest(f.roots)).toBe(4)
    expect(f.detached.length).toBe(1)
    // הצומת שנותק מופיע כשורש, והמעגל נשבר
    expect(f.roots.some(r => r.id === 'a' || r.id === 'b')).toBe(true)
    const ids = collectIds(f)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('childOfA')
  })

  it('🔴 צומת שהוא ההורה של עצמו — מופיע, ותת-העץ שלו איתו', () => {
    const flat = [n('root', null), { id: 'self', parent_id: 'self' }, n('kid', 'self')]
    const f = buildForest(flat)

    expect(countForest(f.roots)).toBe(3)
    expect(f.selfParented).toEqual(['self'])
    const self = f.roots.find(r => r.id === 'self')!
    expect(self.children.map(c => c.id)).toEqual(['kid'])
    // ⚠️ אינו ילד של עצמו — אחרת המעבר על העץ היה נכנס ללופ
    expect(self.children.some(c => c.id === 'self')).toBe(false)
  })

  it('מעגל ארוך (שלושה) — כולם מופיעים פעם אחת בלבד', () => {
    const flat = [n('root', null), n('x', 'z'), n('y', 'x'), n('z', 'y')]
    const f = buildForest(flat)

    expect(countForest(f.roots)).toBe(4)
    const ids = collectIds(f)
    expect(ids.sort()).toEqual(['root', 'x', 'y', 'z'])
    // אף צומת לא מופיע פעמיים
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('שני מעגלים נפרדים — שניהם משוחררים', () => {
    const flat = [
      n('root', null),
      n('a1', 'a2'), n('a2', 'a1'),
      n('b1', 'b2'), n('b2', 'b1'),
    ]
    const f = buildForest(flat)

    expect(countForest(f.roots)).toBe(5)
    expect(f.detached.length).toBe(2)
    expect(collectIds(f).sort()).toEqual(['a1', 'a2', 'b1', 'b2', 'root'])
  })

  it('⚠️ סך הצמתים ביער שווה תמיד לסך הרשומות — בכל תרחיש', () => {
    // הבדיקה שמכסה את מה שדווח: לא משנה כמה הנתונים מקולקלים, אף רשומה
    // לא נופלת מהתצוגה.
    const cases: N[][] = [
      [],
      [n('a', null)],
      [n('a', 'a')],
      [n('a', 'b'), n('b', 'a')],
      [n('a', 'missing')],
      [n('r', null), n('a', 'b'), n('b', 'c'), n('c', 'a'), n('d', 'c')],
      [n('r', null), n('a', 'r'), n('b', 'a'), n('c', 'b'), n('d', 'c'), n('e', 'd')],
    ]
    for (const flat of cases) {
      const f = buildForest(flat)
      expect(countForest(f.roots), `נפלו צמתים עבור ${JSON.stringify(flat)}`).toBe(flat.length)
    }
  })

  it('שרשרת עמוקה אינה מפילה את המחסנית', () => {
    // 20,000 דורות — לא מציאותי, אבל מוכיח שהמעבר איטרטיבי.
    const flat: N[] = [n('g0', null)]
    for (let i = 1; i < 20000; i++) flat.push(n(`g${i}`, `g${i - 1}`))
    const f = buildForest(flat)
    expect(countForest(f.roots)).toBe(20000)
  })
})

function collectIds(f: ReturnType<typeof buildForest<N>>): string[] {
  const out: string[] = []
  const stack = [...f.roots]
  const seen = new Set<string>()
  while (stack.length) {
    const node = stack.pop()!
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push(node.id)
    for (const c of node.children) stack.push(c)
  }
  return out
}
