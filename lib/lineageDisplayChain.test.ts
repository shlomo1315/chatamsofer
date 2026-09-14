import { describe, it, expect } from 'vitest'
import { displayChain } from './lineageDisplayChain'

// 🔴 אותו מוטב חייב להיראות זהה בכל מסך (עקשטיין 212404438, בלייכברד 200360204).
describe('🔴 displayChain — מקור אחד לכל המסכים', () => {
  const saved = [
    { generation: 2, name: 'רבי אברהם שמואל בנימין בעל הכתב סופר' },
    { generation: 1, name: 'מרן החתם סופר זי"ע' },
    { generation: 3, name: 'רבי יצחק צבי ורויזא פריי' },
  ]
  const tree = [
    { generation: 1, name: 'מרן החתם סופר זי"ע' },
    { generation: 2, name: 'רבי אברהם שמואל בנימין בעל הכתב סופר' },
    { generation: 3, name: 'רבי עקיבא וגיטל קליין' },
  ]

  it('🔴 הבחירה השמורה גוברת על העץ', () => {
    expect(displayChain(saved, tree).map(c => c.name)).toEqual([
      'מרן החתם סופר זי"ע',
      'רבי אברהם שמואל בנימין בעל הכתב סופר',
      'רבי יצחק צבי ורויזא פריי',
    ])
  })

  it('ממוין לפי דור גם כשנשמר בלי סדר', () => {
    expect(displayChain(saved, null).map(c => c.generation)).toEqual([1, 2, 3])
  })

  it('בלי שרשרת שמורה → נופל לעץ', () => {
    expect(displayChain(null, tree).map(c => c.name)).toContain('רבי עקיבא וגיטל קליין')
    expect(displayChain([], tree)).toHaveLength(3)
  })

  it('אין כלום → רשימה ריקה', () => {
    expect(displayChain(null, null)).toEqual([])
  })

  // ⚠️ שם ריק היה מייצר צ'יפ בלי טקסט שנראה כתקלה.
  it('שמות ריקים מסוננים', () => {
    expect(displayChain([
      { generation: 1, name: 'תקין' },
      { generation: 2, name: '   ' },
    ], null)).toHaveLength(1)
  })

  it('relation נשמר', () => {
    expect(displayChain([{ generation: 8, name: 'פלוני', relation: 'son_in_law' }], null)[0].relation)
      .toBe('son_in_law')
  })

  // 🔴 שני המסכים חייבים לקבל בדיוק את אותו פלט.
  it('🔴 אותו קלט → אותו פלט, תמיד', () => {
    expect(displayChain(saved, tree)).toEqual(displayChain(saved, tree))
  })
})
