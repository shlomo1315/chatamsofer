import { describe, it, expect } from 'vitest'
import { gilyonFileName } from './gilyonotFileName'

describe('gilyonFileName', () => {
  it('שם הגיליון עם הסיומת המקורית, בלי שם הקובץ מהמחשב', () => {
    expect(gilyonFileName({ title: 'גיליון החתם סופר', parasha: 'חיי שרה' }, 'רכסים — רשימה לראש המוקד.PDF')).toBe('פרשת חיי שרה.pdf')
  })
  it('בלי פרשה משתמשים בנושא, ומנקים תווים אסורים ושומרים עברית', () => {
    expect(gilyonFileName({ title: 'גיליון: "מיוחד"/א', parasha: '' }, 'x.docx')).toBe('גיליון מיוחד א.docx')
  })
})
