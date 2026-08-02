import { describe, it, expect } from 'vitest'
import { planCascade, type MergeNodeRow } from './lineageMerge'

// ─────────────────────────────────────────────────────────────────────────────
// המפל — בשני הכיוונים.
//
// ⚠️ הבאג שהבדיקות האלה שומרות עליו: הכלל כלפי מעלה חיפש "אח של ההורה באותו
// שם". בשרשרת שהתפצלה זה פשוט לא נכון — ההורים הכפולים אינם אחים אלא יושבים
// תחת סבים כפולים בעצמם, ולכן המפל נעצר מיד והשאיר חצי שרשרת תלויה באוויר.
// ─────────────────────────────────────────────────────────────────────────────

const n = (id: string, name: string, parent: string | null, gen: number, status = 'verified'): MergeNodeRow =>
  ({ id, name, parent_id: parent, generation: gen, status, relation: null })

/** שרשרת שהתפצלה: אותו אדם נרשם ע"י שני צאצאים, כל אחד בנה את הענף עד עצמו. */
const splitChain = (): MergeNodeRow[] => [
  n('root', 'החתם סופר', null, 1),
  n('A1', 'רבי אברהם כהן', 'root', 2),
  n('A2', "ר' אברהם כהן", 'root', 2),
  n('B1', 'רבי משה כהן', 'A1', 3),
  n('B2', 'משה כהן', 'A2', 3),
  n('C1', 'רבי יעקב כהן', 'B1', 4),
  n('C2', 'יעקב כהן', 'B2', 4),
  n('D1', 'שרה לוי', 'C1', 5),
  n('D2', 'רחל גולד', 'C2', 5),
]

describe('מפל כלפי מעלה — לפי ההורים של מה שמוזג', () => {
  it('מיזוג בדור 4 גורר את כל השרשרת עד השורש', () => {
    // ⚠️ זה הלב. C1/C2 אינם אחים (תחת B1 ו-B2), ולכן הכלל הישן ("אח של
    // ההורה") היה נעצר מיד. הכלל הנכון עוקב אחרי ההורים ומטפס עד למעלה.
    const plan = planCascade(splitChain(), 'C1', ['C2'])
    const up = plan.steps.filter(s => s.direction === 'up')

    expect(up.map(s => s.keepId)).toEqual(['B1', 'A1'])
    expect(up.flatMap(s => s.mergeIds)).toEqual(['B2', 'A2'])
    expect(plan.topId).toBe('A1')
    expect(plan.totalMerged).toBe(3)   // C2 + B2 + A2
  })

  it('תארים שונים אינם מונעים את הטיפוס', () => {
    // "רבי אברהם כהן" מול "ר' אברהם כהן" — אותו אדם
    const plan = planCascade(splitChain(), 'C1', ['C2'])
    expect(plan.steps.some(s => s.mergeIds.includes('A2'))).toBe(true)
    expect(plan.stopped).toHaveLength(0)
  })

  it('שם שונה באמת — המפל נעצר ומדווח, ולא ממזג', () => {
    // ⚠️ הקו האדום: התאמה מקורבת לעולם אינה ממוזגת אוטומטית.
    const tree = splitChain().map(x => (x.id === 'B2' ? { ...x, name: 'משה צבי כהן' } : x))
    const plan = planCascade(tree, 'C1', ['C2'])

    expect(plan.steps.some(s => s.mergeIds.includes('B2'))).toBe(false)
    expect(plan.stopped).toHaveLength(1)
    expect(plan.stopped[0].otherName).toBe('משה צבי כהן')
    expect(plan.stopped[0].keepName).toBe('רבי משה כהן')
    // ומכיוון שנעצרנו — גם דור 2 לא מוזג, כי אין דרך לדעת שהם מתחברים
    expect(plan.steps.some(s => s.mergeIds.includes('A2'))).toBe(false)
  })

  it('צומת שסומן "נדחה" אינו נגרר במפל', () => {
    const tree = splitChain().map(x => (x.id === 'A2' ? { ...x, status: 'rejected' } : x))
    const plan = planCascade(tree, 'C1', ['C2'])
    expect(plan.steps.some(s => s.mergeIds.includes('A2'))).toBe(false)
  })

  it('upApprox — ניסוח שונה בהורים כן ממוזג, והשם המפורט נשמר', () => {
    // ⚠️ המקרה האמיתי מהשטח: "שמואל בנימין שישא" מול "רבי שמואל בנימין
    // והרבנית חיה ליבא שישא". הבן מוזג ידנית, והאב נשאר כפול — כי המפתחות
    // אינם זהים. עם הסכמת המשתמש ההורים מתמזגים לפי המבנה, לא לפי השם.
    const tree = [
      n('root', 'החתם סופר', null, 5),
      n('P1', 'רבי שמואל בנימין והרבנית חיה ליבא שישא', 'root', 6),
      n('P2', 'שמואל בנימין שישא', 'root', 6),
      n('K1', 'רבי צבי אלימלך והרבנית שרה שאשא ראטשילד', 'P1', 7),
      n('K2', 'צבי אלימלך ראטשילד', 'P2', 7),
    ]
    const plan = planCascade(tree, 'K1', ['K2'], { upApprox: true })
    const up = plan.steps.filter(s => s.direction === 'up')

    expect(up).toHaveLength(1)
    expect(up[0].keepId).toBe('P1')
    expect(up[0].mergeIds).toEqual(['P2'])
    expect(up[0].approx).toBe(true)
    // הניסוח המפורט הוא שנשאר — אחרת שם האישה והתואר היו נמחקים בשקט
    expect(up[0].suggestedName).toBe('רבי שמואל בנימין והרבנית חיה ליבא שישא')
    expect(plan.stopped).toHaveLength(0)
  })

  it('upApprox חל רק על הורים של מה שמוזג — לא על אחים בשם דומה', () => {
    // ⚠️ הקו האדום נשאר: אח בשם דומה תחת אותו אב אינו ממוזג לעולם אוטומטית.
    const tree = [
      n('root', 'החתם סופר', null, 1),
      n('P1', 'רבי שמואל שישא', 'root', 2),
      n('P2', 'שמואל שישא הזקן', 'root', 2),   // אח, לא הורה של מה שמוזג
      n('K1', 'צבי ראטשילד', 'P1', 3),
    ]
    const plan = planCascade(tree, 'K1', [], { upApprox: true })
    expect(plan.steps.some(s => s.mergeIds.includes('P2'))).toBe(false)
  })

  it('בלי upApprox ההתנהגות אינה משתנה — עצירה ודיווח', () => {
    const tree = splitChain().map(x => (x.id === 'B2' ? { ...x, name: 'משה צבי כהן' } : x))
    const plan = planCascade(tree, 'C1', ['C2'])
    expect(plan.steps.some(s => s.mergeIds.includes('B2'))).toBe(false)
    expect(plan.stopped).toHaveLength(1)
  })

  it('כיבוי המפל כלפי מעלה משאיר רק את המיזוג שהתבקש', () => {
    const plan = planCascade(splitChain(), 'C1', ['C2'], { up: false, down: false })
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].direction).toBe('requested')
  })
})

describe('מפל כלפי מטה', () => {
  it('מיזוג הורים הופך ילדים לאחים וממזג גם אותם', () => {
    // אותה שרשרת, אבל הילדים בדור 5 נושאים את אותו שם
    const tree = splitChain().map(x =>
      x.id === 'D2' ? { ...x, name: 'שרה לוי' } : x)
    const plan = planCascade(tree, 'C1', ['C2'])
    const down = plan.steps.filter(s => s.direction === 'down')
    expect(down.flatMap(s => s.mergeIds)).toContain('D2')
  })

  it('ילדים בשמות שונים אינם ממוזגים', () => {
    const plan = planCascade(splitChain(), 'C1', ['C2'])
    const down = plan.steps.filter(s => s.direction === 'down')
    expect(down.flatMap(s => s.mergeIds)).not.toContain('D2')
  })
})

describe('עמידות', () => {
  it('מעגל בנתונים אינו תולה את התכנון', () => {
    // אב שהוא גם צאצא — קורה אחרי עריכה שגויה
    const tree = [n('x', 'א', 'y', 1), n('y', 'א', 'x', 2)]
    const t = Date.now()
    const plan = planCascade(tree, 'x', [])
    expect(Date.now() - t).toBeLessThan(2000)
    expect(plan.topId).toBeTruthy()
  })

  it('צומת שאינו קיים מחזיר תוכנית ריקה', () => {
    const plan = planCascade(splitChain(), 'לא-קיים', ['C2'])
    expect(plan.steps).toHaveLength(0)
    expect(plan.totalMerged).toBe(0)
  })

  it('התוכנית אינה משנה את מערך הקלט', () => {
    // ⚠️ התכנון רץ גם לתצוגה מקדימה, לפני שהמשתמש אישר משהו. אם הוא היה
    // משנה את הנתונים שקיבל, התצוגה המקדימה הייתה מזהמת את המצב האמיתי.
    const tree = splitChain()
    const snapshot = JSON.stringify(tree)
    planCascade(tree, 'C1', ['C2'])
    expect(JSON.stringify(tree)).toBe(snapshot)
  })
})
