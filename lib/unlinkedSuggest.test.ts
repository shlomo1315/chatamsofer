import { describe, it, expect } from 'vitest'
import {
  readChain, benDisplayName, suggestNode, indexNodesByName, buildUnlinkedRows,
  type TreeNode,
} from './unlinkedSuggest'

// ⚠️ מה שנבדק כאן: ההצעה למנהל חייבת להיות *העמוקה ביותר שנמצאה*, ולהימנע
// לגמרי כששם מופיע פעמיים. הצעה בדור רדוד או בין שני מועמדים שווים מעבירה
// אדם לענף זר — וזו טעות שקשה לגלות אחרי שהיא נשמרה.

const n = (id: string, name: string, generation: number, parent_id: string | null = null): TreeNode =>
  ({ id, name, generation, parent_id })

const TREE = [
  n('r', 'רבי משה סופר', 1),
  n('a', 'רבי אברהם שמואל בנימין סופר', 2, 'r'),
  n('b', 'רבי שמעון סופר', 3, 'a'),
  n('c', 'רבי יעקב כהן', 4, 'b'),
]

describe('קריאת שרשרת הייחוס', () => {
  it('ממוינת לפי דור ומסננת ריקים', () => {
    const chain = readChain([
      { generation: 3, name: 'רבי שמעון סופר' },
      { generation: 1, name: 'רבי משה סופר' },
      { generation: 2, name: '  ' },
    ])
    expect(chain.map(c => c.generation)).toEqual([1, 3])
  })

  it('ערך שאינו מערך מחזיר ריק', () => {
    expect(readChain(null)).toEqual([])
    expect(readChain('לא מערך')).toEqual([])
  })
})

describe('הצעת צומת לשיוך', () => {
  const byName = indexNodesByName(TREE)

  it('בוחרת את הדור העמוק ביותר שנמצא בעץ', () => {
    // ⚠️ הליבה: התאמה בדור 1 קיימת תמיד (השורש), והצעה שלה הייתה מציבה את
    // הנרשם ישירות תחת האב-הקדמון ומוחקת את כל הדורות שביניהם.
    const chain = readChain([
      { generation: 1, name: 'רבי משה סופר' },
      { generation: 3, name: 'רבי שמעון סופר' },
    ])
    const s = suggestNode(chain, byName)
    expect(s?.nodeId).toBe('b')
    expect(s?.matchedGeneration).toBe(3)
  })

  it('מדלגת על דור שאינו בעץ וממשיכה מעלה', () => {
    const chain = readChain([
      { generation: 2, name: 'רבי אברהם שמואל בנימין סופר' },
      { generation: 9, name: 'רבי מישהו שאינו בעץ' },
    ])
    expect(suggestNode(chain, byName)?.nodeId).toBe('a')
  })

  it('מסמנת ambiguous כששם מופיע פעמיים — ולא בוחרת בשבילו', () => {
    const dup = indexNodesByName([...TREE, n('c2', 'רבי יעקב כהן', 4, 'b')])
    const s = suggestNode(readChain([{ generation: 4, name: 'רבי יעקב כהן' }]), dup)
    expect(s?.ambiguous).toBe(true)
  })

  it('מתעלמת מתארים בהשוואה', () => {
    // autoMergeKey מסיר "רבי"/"מרת", ולכן שרשרת שנכתבה בלי תואר עדיין נמצאת.
    expect(suggestNode(readChain([{ generation: 3, name: 'שמעון סופר' }]), byName)?.nodeId).toBe('b')
  })

  it('שרשרת ריקה או ללא התאמה — אין הצעה', () => {
    expect(suggestNode([], byName)).toBeNull()
    expect(suggestNode(readChain([{ generation: 5, name: 'שם שאינו קיים' }]), byName)).toBeNull()
  })

  it('matchedDepth סופר כמה דורות מהשרשרת נמצאו', () => {
    const chain = readChain([
      { generation: 1, name: 'רבי משה סופר' },
      { generation: 3, name: 'רבי שמעון סופר' },
      { generation: 7, name: 'לא בעץ' },
    ])
    expect(suggestNode(chain, byName)?.matchedDepth).toBe(2)
  })
})

describe('שם לתצוגה', () => {
  it('בעל ואישה ושם משפחה', () => {
    expect(benDisplayName({ id: '1', full_name: 'משה', spouse_name: 'חיה', family_name: 'כהן' }))
      .toBe('משה וחיה כהן')
  })

  it('בלי בת זוג', () => {
    expect(benDisplayName({ id: '1', full_name: 'משה', family_name: 'כהן' })).toBe('משה כהן')
  })

  it('בלי שם כלל אינו מחזיר מחרוזת ריקה', () => {
    // ⚠️ שורה בלי שם עדיין צריכה להיות לחיצה במסך — אחרת היא נעלמת מהרשימה
    // והנרשם נשאר בלי שיוך לנצח.
    expect(benDisplayName({ id: '1' })).toBe('(ללא שם)')
  })
})

describe('בניית השורות למסך', () => {
  it('מחברת שרשרת, הצעה ופרטי קשר', () => {
    const rows = buildUnlinkedRows([{
      id: 'x', id_number: '123', full_name: 'יעקב', family_name: 'כהן',
      email: 'a@b.com', phone: '0501234567', created_at: '2026-01-01',
      lineage_chain: [
        { generation: 1, name: 'רבי משה סופר' },
        { generation: 3, name: 'רבי שמעון סופר' },
      ],
    }], TREE)
    expect(rows).toHaveLength(1)
    expect(rows[0].chainLength).toBe(2)
    expect(rows[0].chainTail).toBe('רבי שמעון סופר')
    expect(rows[0].suggestion?.nodeId).toBe('b')
  })

  it('נרשם בלי שרשרת נשאר ברשימה בלי הצעה', () => {
    const rows = buildUnlinkedRows([{ id: 'y', full_name: 'שרה', family_name: 'לוי' }], TREE)
    expect(rows[0].suggestion).toBeNull()
    expect(rows[0].chainLength).toBe(0)
  })
})
