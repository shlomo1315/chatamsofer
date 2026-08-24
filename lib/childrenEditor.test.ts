import { describe, it, expect } from 'vitest'
import {
  childrenPayload,
  diffChildren,
  docTypeOf,
  isLinkedToMaternity,
  removeChildrenAt,
  resizeChildren,
  type EditableChild,
} from './childrenEditor'

// ⚠️ המודול הזה הוא מקור האמת היחיד לשני מסלולי השמירה של הילדים —
// טופס העריכה (BeneficiaryForm) והעריכה מתוך הכרטסת (API). כל כלל שנשמר
// רק באחד מהם נסחף. הבדיקות כאן מייבאות את הפונקציות האמיתיות ולא
// מחזיקות עותק של הכלל.

function child(over: Partial<EditableChild> = {}): EditableChild {
  return { name: 'ילד', id_number: '', doc_type: 'id', gender: 'male', birth_date: '', marital_status: '', ...over }
}

describe('resizeChildren — שינוי מספר הילדים', () => {
  it('הפחתת המספר לא מוחקת אף ילד — רק מדווחת כמה עודפים', () => {
    // 🔴 הבאג המקורי: prev.slice(0, n) מחק בשקט את הילדים האחרונים.
    // משפחה עם 5 ילדים שעודכנה ל-3 איבדה את ילדים 4-5 עם כל הפרטים.
    const kids = [child({ name: 'א' }), child({ name: 'ב' }), child({ name: 'ג' }), child({ name: 'ד' }), child({ name: 'ה' })]
    const res = resizeChildren(kids, 3)
    expect(res.children).toHaveLength(5)
    expect(res.children.map(c => c.name)).toEqual(['א', 'ב', 'ג', 'ד', 'ה'])
    expect(res.needsRemoval).toBe(2)
  })

  it('הגדלת המספר מוסיפה כרטיסים ריקים', () => {
    const res = resizeChildren([child({ name: 'א' })], 3)
    expect(res.children).toHaveLength(3)
    expect(res.children[0].name).toBe('א')
    expect(res.children[1].name).toBe('')
    expect(res.needsRemoval).toBe(0)
  })

  it('אותו מספר לא משנה דבר', () => {
    const kids = [child({ name: 'א' }), child({ name: 'ב' })]
    const res = resizeChildren(kids, 2)
    expect(res.children).toEqual(kids)
    expect(res.needsRemoval).toBe(0)
  })

  it('מספר לא תקין או שלילי נחשב ל-0', () => {
    const kids = [child(), child()]
    expect(resizeChildren(kids, -4).needsRemoval).toBe(2)
    expect(resizeChildren(kids, Number.NaN).needsRemoval).toBe(2)
  })

  it('נעצר בתקרה של 30 ילדים', () => {
    expect(resizeChildren([], 99).children).toHaveLength(30)
  })
})

describe('removeChildrenAt — מחיקה לפי בחירה', () => {
  it('מוחק בדיוק את מי שסומן, ולא את האחרונים', () => {
    const kids = [child({ name: 'א' }), child({ name: 'ב' }), child({ name: 'ג' }), child({ name: 'ד' })]
    expect(removeChildrenAt(kids, [0, 2]).map(c => c.name)).toEqual(['ב', 'ד'])
  })

  it('מתעלם מאינדקסים כפולים או מחוץ לתחום', () => {
    const kids = [child({ name: 'א' }), child({ name: 'ב' })]
    expect(removeChildrenAt(kids, [1, 1, 7, -1]).map(c => c.name)).toEqual(['א'])
  })

  it('רשימה ריקה של סימונים משאירה הכול', () => {
    const kids = [child({ name: 'א' })]
    expect(removeChildrenAt(kids, [])).toHaveLength(1)
  })
})

describe('childrenPayload — children ו-children_count נשמרים יחד', () => {
  it('המונה תמיד שווה לאורך הרשימה', () => {
    // 🔴 שני השדות נשמרו בנפרד; כשאחד עודכן והשני לא, הכרטסת הציגה
    // "5 ילדים" מעל טבלה של 3.
    const p = childrenPayload([child(), child(), child()])
    expect(p.children_count).toBe(3)
    expect(p.children).toHaveLength(3)
  })

  it('רשימה ריקה שומרת מערך ריק ומונה 0 — לא null', () => {
    const p = childrenPayload([])
    expect(p.children).toEqual([])
    expect(p.children_count).toBe(0)
  })

  it('שדות היולדת נשמרים ולא נזרקים בנרמול', () => {
    const p = childrenPayload([child({ birth_status: 'approved', maternity_aid_id: 'aid-1' })])
    expect(p.children[0].birth_status).toBe('approved')
    expect(p.children[0].maternity_aid_id).toBe('aid-1')
  })

  it('ילד בלי ת"ז נשמר עם null ולא עם מחרוזת ריקה', () => {
    // המאגר מצפה ל-null; מחרוזת ריקה נראית כמו ת"ז קיימת בחיפושים.
    expect(childrenPayload([child({ id_number: '  ' })]).children[0].id_number).toBeNull()
  })

  it('🔴 ילד בלי doc_type נשמר בלי doc_type — לא נכתבת ברירת מחדל', () => {
    // 27,866 מתוך 28,106 הילדים במאגר נשמרו בלי doc_type (השדה נוסף
    // מאוחר). כתיבת 'id' לכולם הייתה משנה את כל הרשומות בשמירה אחת,
    // ומסמנת "שינוי" על ילד שאיש לא נגע בו.
    const p = childrenPayload([{ name: 'א', id_number: '', gender: 'male', birth_date: '', marital_status: '' }])
    expect('doc_type' in p.children[0]).toBe(false)
  })

  it('ילד בלי doc_type אינו נספר כשינוי', () => {
    const stored: EditableChild = { name: 'א', id_number: '', gender: 'male', birth_date: '', marital_status: '' }
    expect(diffChildren([stored], [{ ...stored }]).hasChanges).toBe(false)
  })

  it('ת"ז נשמרת ספרות בלבד, דרכון כפי שהוקלד', () => {
    expect(childrenPayload([child({ id_number: '123-456-789', doc_type: 'id' })]).children[0].id_number).toBe('123456789')
    expect(childrenPayload([child({ id_number: 'AB1234', doc_type: 'passport' })]).children[0].id_number).toBe('AB1234')
  })

  it('🔴 דרכון תחת id_doc_type נשמר תחת אותו מפתח ואינו מנוקה לספרות', () => {
    // 27,549 ילדים נשמרו תחת id_doc_type, מהם 279 בעלי דרכון. כתיבה
    // ל-doc_type בלבד הייתה מוחקת את סימון הדרכון שלהם, וניקוי ספרות
    // היה הורס מספר דרכון עם אותיות.
    const out = childrenPayload([
      { name: 'א', id_number: 'AB1234', id_doc_type: 'passport', gender: 'male', birth_date: '', marital_status: '' },
    ]).children[0]
    expect(out.id_doc_type).toBe('passport')
    expect('doc_type' in out).toBe(false)
    expect(out.id_number).toBe('AB1234')
  })

  it('ילד ותיק תחת id_doc_type אינו נספר כשינוי', () => {
    const stored: EditableChild = { name: 'א', id_number: '123456789', id_doc_type: 'id', gender: 'male', birth_date: '', marital_status: '' }
    expect(diffChildren([stored], [{ ...stored }]).hasChanges).toBe(false)
  })

  it('docTypeOf קוראת משני השמות', () => {
    expect(docTypeOf({ id_doc_type: 'passport' })).toBe('passport')
    expect(docTypeOf({ doc_type: 'id' })).toBe('id')
    expect(docTypeOf({})).toBeUndefined()
  })

  it('רווחים מיותרים בשם נחתכים', () => {
    expect(childrenPayload([child({ name: '  משה  ' })]).children[0].name).toBe('משה')
  })
})

describe('diffChildren — מה מפעיל את כפתור השמירה', () => {
  it('אין שינוי — הכפתור מושבת', () => {
    const kids = [child({ name: 'א' }), child({ name: 'ב' })]
    const d = diffChildren(kids, kids.map(c => ({ ...c })))
    expect(d.hasChanges).toBe(false)
    expect(d.changeCount).toBe(0)
  })

  it('עריכת שדה נספרת כשינוי אחד', () => {
    const before = [child({ name: 'א' })]
    const after = [child({ name: 'אברהם' })]
    const d = diffChildren(before, after)
    expect(d.hasChanges).toBe(true)
    expect(d.changeCount).toBe(1)
    expect(d.edited).toEqual([0])
  })

  it('שני שדות באותו ילד נספרים כשינוי אחד', () => {
    const d = diffChildren([child({ name: 'א' })], [child({ name: 'ב', gender: 'female' })])
    expect(d.changeCount).toBe(1)
  })

  it('מחיקה והוספה נספרות', () => {
    const d = diffChildren([child({ name: 'א' }), child({ name: 'ב' })], [child({ name: 'א' })])
    expect(d.removed).toBe(1)
    expect(d.hasChanges).toBe(true)

    const d2 = diffChildren([child({ name: 'א' })], [child({ name: 'א' }), child({ name: 'ב' })])
    expect(d2.added).toBe(1)
    expect(d2.hasChanges).toBe(true)
  })

  it('הבדל של רווחים בלבד אינו שינוי', () => {
    // אחרת הכפתור מהבהב בלי שהמשתמש שינה משהו אמיתי.
    expect(diffChildren([child({ name: 'משה' })], [child({ name: ' משה ' })]).hasChanges).toBe(false)
  })
})

describe('isLinkedToMaternity — ילד שהגיע מתיק לידה', () => {
  it('מזהה לפי maternity_aid_id', () => {
    expect(isLinkedToMaternity(child({ maternity_aid_id: 'aid-1' }))).toBe(true)
  })

  it('מזהה גם לפי birth_status בלבד', () => {
    expect(isLinkedToMaternity(child({ birth_status: 'pending' }))).toBe(true)
  })

  it('ילד רגיל אינו קשור', () => {
    expect(isLinkedToMaternity(child())).toBe(false)
  })
})
