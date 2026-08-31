import { describe, it, expect } from 'vitest'
import { mainPathTitles } from './ivrSteps'
import type { IvrNode } from './ivrMap'

// ─────────────────────────────────────────────────────────────────────────────
// שרשרת השלבים שמוצגת על כרטיס השלוחה.
//
// ⚠️ רק המסלול הראשי ולא כל הענפים: עץ החגים הוא שבע רמות, והצגת כולן
// על הכרטיס הופכת את הרשימה לקיר טקסט שאי אפשר לסרוק.
// ─────────────────────────────────────────────────────────────────────────────

const node = (id: string, title: string, children?: IvrNode[]): IvrNode =>
  ({ id, title, what: '', kind: 'menu', children })

describe('mainPathTitles', () => {
  it('עץ שטוח — שלב אחד', () => {
    expect(mainPathTitles([node('a', 'זיהוי')])).toEqual(['זיהוי'])
  })

  it('🔴 יורד לעומק לפי הילד הראשון', () => {
    const tree = [node('a', 'ת״ז', [node('b', 'אישור', [node('c', 'מוקד')])])]
    expect(mainPathTitles(tree)).toEqual(['ת״ז', 'אישור', 'מוקד'])
  })

  it('⚠️ ענפים נוספים אינם נכללים — רק הראשון בכל רמה', () => {
    const tree = [node('a', 'שורש', [node('b', 'ראשון'), node('c', 'שני')])]
    expect(mainPathTitles(tree)).toEqual(['שורש', 'ראשון'])
  })

  it('עץ ריק אינו קורס', () => {
    expect(mainPathTitles([])).toEqual([])
  })

  it('⚠️ מוגבל באורך — שרשרת ארוכה מדי אינה נכנסת לכרטיס', () => {
    const deep = [node('1', 'א', [node('2', 'ב', [node('3', 'ג', [node('4', 'ד', [node('5', 'ה')])])])])]
    expect(mainPathTitles(deep, 3)).toEqual(['א', 'ב', 'ג'])
  })
})
