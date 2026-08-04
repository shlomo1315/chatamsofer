import { describe, it, expect } from 'vitest'
import { resolveChainAgainstTree, nameMatchesLoose, type ResolveNode } from './lineageResolve'

// עץ מצומצם בניסוח האמיתי של המאגר: הצומת נושא את שם הבעל, והשרשרת המוקלדת
// נושאת ניסוח מורכב (בעל + אשה / "מרת X אשת רבי Y").
const tree: ResolveNode[] = [
  { id: 'n1', name: 'מרן החתם סופר זי"ע', parent_id: null, generation: 1, status: 'verified' },
  { id: 'n2', name: 'רבי משה טוביה לעהמאן', parent_id: 'n1', generation: 2, status: 'verified' },
  { id: 'n2b', name: 'רבי שמעון סופר', parent_id: 'n1', generation: 2, status: 'verified' },
  { id: 'n3', name: 'רבי משה ברוך גרויז', parent_id: 'n2', generation: 3, status: 'verified' },
  { id: 'n4', name: 'רבי משה ליברמן', parent_id: 'n3', generation: 4, status: 'verified' },
  { id: 'n5', name: 'רבי טוביה ליברמן', parent_id: 'n4', generation: 5, status: 'pending' },
]

describe('nameMatchesLoose', () => {
  it('מזהה שם צומת בתוך ניסוח מורכב של בעל ואשה', () => {
    expect(nameMatchesLoose('רבי משה טוביה לעהמאן', 'מרת שמחה אשת רבי משה טוביה לעהמאן')).toBe(true)
    expect(nameMatchesLoose('רבי רפאל דויטש', 'רבי רפאל ורחל דויטש')).toBe(true)
    expect(nameMatchesLoose('רבי שמואל זאב פרידענזאן', 'רבי שמואל זאב והרבנית בלימא פרידענזאן')).toBe(true)
  })

  it('מתעלם מהבהרה בסוגריים ומהבדלי כתיב', () => {
    expect(nameMatchesLoose('רבי משה ברוך גרויז', 'רבי משה ברוך ושרל גרויז (גרוס)')).toBe(true)
  })

  it('אינו מתאים שמות שונים', () => {
    expect(nameMatchesLoose('רבי שמעון סופר', 'רבי משה טוביה לעהמאן')).toBe(false)
  })

  it('דורש שני טוקנים לפחות — שם בודד אינו ייחודי דיו', () => {
    // ⚠️ "משה" לבדו מתאים לחצי מהעץ, והתאמה כזו הייתה מזהה את הצומת הלא נכון
    expect(nameMatchesLoose('רבי משה', 'רבי משה ברוך גרויז')).toBe(false)
  })
})

describe('resolveChainAgainstTree', () => {
  it('מזהה את כל הרצף ומחזיר את הסטטוס האמיתי מהעץ', () => {
    const chain = [
      { generation: 1, name: 'מרן החתם סופר זי"ע' },
      { generation: 2, name: 'מרת שמחה אשת רבי משה טוביה לעהמאן' },
      { generation: 3, name: 'רבי משה ברוך ושרל גרויז (גרוס)' },
      { generation: 4, name: 'רבי משה וחוה רבקה ליברמן' },
      { generation: 5, name: 'רבי טוביה ליברמן' },
    ]
    const r = resolveChainAgainstTree(tree, chain)
    expect(r.get(1)?.status).toBe('verified')
    expect(r.get(2)).toEqual({ nodeId: 'n2', status: 'verified' })
    expect(r.get(3)).toEqual({ nodeId: 'n3', status: 'verified' })
    expect(r.get(4)).toEqual({ nodeId: 'n4', status: 'verified' })
    // דור 5 קיים בעץ אך אינו מאושר — הסטטוס האמיתי מוחזר, בלי ליפות
    expect(r.get(5)).toEqual({ nodeId: 'n5', status: 'pending' })
  })

  it('עוצר בדור שאינו מזוהה ואינו מנחש את הבאים אחריו', () => {
    const chain = [
      { generation: 2, name: 'מרת שמחה אשת רבי משה טוביה לעהמאן' },
      { generation: 3, name: 'רבי מישהו אחר לגמרי' },
      { generation: 4, name: 'רבי משה וחוה רבקה ליברמן' },
    ]
    const r = resolveChainAgainstTree(tree, chain)
    expect(r.get(2)?.nodeId).toBe('n2')
    expect(r.has(3)).toBe(false)
    // ⚠️ דור 4 תואם בשם לצומת n4, אבל הרצף נשבר בדור 3 — ולכן אינו מזוהה
    expect(r.has(4)).toBe(false)
  })

  it('מזהה רק ילדים של הצומת שזוהה — לא שם דומה בענף אחר', () => {
    const chain = [
      { generation: 2, name: 'רבי שמעון סופר' },
      // n3 הוא ילד של n2 ולא של n2b, ולכן לא ייבחר כאן
      { generation: 3, name: 'רבי משה ברוך גרויז' },
    ]
    const r = resolveChainAgainstTree(tree, chain)
    expect(r.get(2)?.nodeId).toBe('n2b')
    expect(r.has(3)).toBe(false)
  })

  it('אינו קורס על עץ ריק או שרשרת ריקה', () => {
    expect(resolveChainAgainstTree([], [{ generation: 2, name: 'x' }]).size).toBe(0)
    expect(resolveChainAgainstTree(tree, []).size).toBe(1)   // השורש בלבד
  })
})
