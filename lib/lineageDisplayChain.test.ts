import { describe, it, expect } from 'vitest'
import { displayChain, registrantGeneration } from './lineageDisplayChain'

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

  // 🔴 אבות שהוכנסו ידנית מדור 4 והלאה נעלמו מהכרטסת.
  describe('lineage_manual', () => {
    const three = [1, 2, 3].map(g => ({ generation: g, name: `אב${g}` }))

    it('🔴 מצרף ידניים אחרי הדור האחרון בשרשרת השמורה', () => {
      const out = displayChain(three, null, ['אב4', ' אב5 '])
      expect(out.map(e => [e.generation, e.name])).toEqual([[1, 'אב1'], [2, 'אב2'], [3, 'אב3'], [4, 'אב4'], [5, 'אב5']])
    })

    it('מצרף ידניים גם כשהבסיס הוא מסלול העץ', () => {
      expect(displayChain(null, three, ['אב4'])).toHaveLength(4)
    })

    it('לא מכפיל שם שכבר בשרשרת, ומסנן ריקים', () => {
      expect(displayChain(three, null, ['אב3', '  ', 'אב4'])).toHaveLength(4)
    })

    it('בלי ידניים → ללא שינוי', () => {
      expect(displayChain(three, null, [])).toEqual(displayChain(three, null))
    })

    // מונה "דור" בחלונית הכרטסת הוא אורך השרשרת המוצגת.
    it('🔴 שלושה דורות שמורים ועוד ארבעה ידניים → דור 7', () => {
      expect(displayChain(three, null, ['א', 'ב', 'ג', 'ד'])).toHaveLength(7)
    })
  })

  describe('מספרי דור כפולים', () => {
    it('שני "דור 6" הופכים ל-6 ו-7', () => {
      const rows = [
        { generation: 5, name: 'א' },
        { generation: 6, name: 'ב' },
        { generation: 6, name: 'ג' },
      ]
      expect(displayChain(rows, null).map(c => c.generation)).toEqual([5, 6, 7])
    })
    it('שרשרת תקינה לא משתנה', () => {
      const rows = [{ generation: 1, name: 'א' }, { generation: 2, name: 'ב' }]
      expect(displayChain(rows, null).map(c => c.generation)).toEqual([1, 2])
    })
  })

  describe('registrantGeneration', () => {
    it('אחרי דור 4 הנרשם הוא דור 5', () => {
      const chain = displayChain([1, 2, 3, 4].map(g => ({ generation: g, name: 'א' + g })), null)
      expect(registrantGeneration(chain)).toBe(5)
    })
    it('שרשרת עם אב ידני נספרת לפי הדור האחרון ולא לפי האורך', () => {
      const chain = displayChain([{ generation: 3, name: 'ג' }, { generation: 4, name: 'ד' }], null, ['ה'])
      expect(chain.map(c => c.generation)).toEqual([3, 4, 5])
      expect(registrantGeneration(chain)).toBe(6)
    })
    it('נרשם שכבר בשרשרת — הדור שלו הוא האחרון', () => {
      expect(registrantGeneration([{ generation: 4, name: 'ד' }, { generation: 5, name: 'נרשם' }], true)).toBe(5)
    })
    it('שרשרת ריקה — אין דור', () => {
      expect(registrantGeneration([])).toBeNull()
    })
  })
})
