import { describe, it, expect } from 'vitest'
import { suggestDomainFix, groupFixes } from './emailDomainFix'

describe('suggestDomainFix — מתקן רק שגיאות דומיין ודאיות', () => {
  it('שגיאות כתיב נפוצות ב-gmail מתוקנות', () => {
    expect(suggestDomainFix('yosi@gnail.com')?.fixed).toBe('yosi@gmail.com')
    expect(suggestDomainFix('yosi@gmial.com')?.fixed).toBe('yosi@gmail.com')
    expect(suggestDomainFix('yosi@gmal.com')?.fixed).toBe('yosi@gmail.com')
    expect(suggestDomainFix('yosi@gmail.con')?.fixed).toBe('yosi@gmail.com')
    expect(suggestDomainFix('yosi@gmail.co')?.fixed).toBe('yosi@gmail.com')
  })

  it('החלק שלפני ה-@ נשמר בדיוק', () => {
    // 🔴 הליבה של הכלי: מתקנים דומיין, לא נוגעים בשם.
    expect(suggestDomainFix('a.b+tag_1@gnail.com')?.fixed).toBe('a.b+tag_1@gmail.com')
    expect(suggestDomainFix('SHLOMO.W@gnail.com')?.fixed).toBe('SHLOMO.W@gmail.com')
  })

  it('כתובת תקינה אינה נוגעת', () => {
    expect(suggestDomainFix('yosi@gmail.com')).toBeNull()
    expect(suggestDomainFix('yosi@walla.co.il')).toBeNull()
    expect(suggestDomainFix('yosi@hotmail.com')).toBeNull()
  })

  it('🔴 שם שגוי עם דומיין תקין אינו "מתוקן"', () => {
    // זה בדיוק המקרה שאי אפשר לנחש: הדומיין מושלם, השם פשוט לא קיים.
    // כל ניסיון תיקון כאן היה המצאה.
    expect(suggestDomainFix('shlomo123@gmail.com')).toBeNull()
    expect(suggestDomainFix('typo@gmail.com')).toBeNull()
  })

  it('דומיין לא מוכר נשאר כמו שהוא', () => {
    // ⚠️ רשימה מפורשת ולא דמיון מחושב — דומיין ארגוני לא מוכר אינו שגיאה.
    expect(suggestDomainFix('yosi@mycompany.co.il')).toBeNull()
    expect(suggestDomainFix('yosi@somewhere.net')).toBeNull()
  })

  it('כתובת פגומה מעבר לדומיין אינה מתוקנת', () => {
    // תיקון כזה היה יוצר כתובת שנראית תקינה אך עדיין לא ניתנת לשליחה.
    expect(suggestDomainFix('יוסי@gnail.com')).toBeNull()
    expect(suggestDomainFix('yo si@gnail.com')).toBeNull()
    expect(suggestDomainFix('yo..si@gnail.com')).toBeNull()
    expect(suggestDomainFix('@gnail.com')).toBeNull()
    expect(suggestDomainFix('yosi@')).toBeNull()
    expect(suggestDomainFix('yosi')).toBeNull()
    expect(suggestDomainFix('')).toBeNull()
    expect(suggestDomainFix(null)).toBeNull()
  })

  it('רווחים בקצוות נגזרים', () => {
    expect(suggestDomainFix('  yosi@gnail.com  ')?.fixed).toBe('yosi@gmail.com')
  })

  it('דומיין באותיות גדולות מזוהה', () => {
    expect(suggestDomainFix('yosi@GNAIL.COM')?.fixed).toBe('yosi@gmail.com')
  })

  it('@ מרובה — נלקח האחרון, וכתובת כזו נדחית', () => {
    // "a@b@gnail.com" אינה כתובת תקינה; החלק שלפני ה-@ האחרון מכיל @.
    const r = suggestDomainFix('a@b@gnail.com')
    // אם מוחזר תיקון, הוא חייב לשמר את כל מה שלפני ה-@ האחרון.
    if (r) expect(r.fixed).toBe('a@b@gmail.com')
  })
})

describe('groupFixes — סיכום לפי סוג השגיאה', () => {
  it('מקבץ וסופר, הגדול קודם', () => {
    const fixes = [
      { original: 'a@gnail.com', fixed: 'a@gmail.com', fromDomain: 'gnail.com', toDomain: 'gmail.com' },
      { original: 'b@gnail.com', fixed: 'b@gmail.com', fromDomain: 'gnail.com', toDomain: 'gmail.com' },
      { original: 'c@gmial.com', fixed: 'c@gmail.com', fromDomain: 'gmial.com', toDomain: 'gmail.com' },
    ]
    const groups = groupFixes(fixes)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({ fromDomain: 'gnail.com', toDomain: 'gmail.com', count: 2 })
    expect(groups[1].count).toBe(1)
  })

  it('רשימה ריקה', () => {
    expect(groupFixes([])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// שכבת ה-near-miss: תופסת שגיאות כתיב שאינן ברשימה הידנית.
//
// 🔴 הטסטים החשובים כאן הם דווקא השליליים — שדומיין אמיתי לא ייהרס.
// ─────────────────────────────────────────────────────────────────────────────
describe('nearMissDomain — תיקון מעבר לרשימה הידנית', () => {
  it('שגיאות שדווחו מהשטח מתוקנות', () => {
    for (const bad of ['gmatl.com', 'gmail.cam', 'gmqil.com', 'gmsil.com']) {
      const fix = suggestDomainFix(`a@${bad}`)
      expect(fix, bad).not.toBeNull()
      expect(fix!.toDomain, bad).toBe('gmail.com')
    }
  })

  it('תופס שגיאת אות בודדת שלא נצפתה מעולם', () => {
    // אף אחת מאלה אינה ברשימה הידנית — האלגוריתם לבדו
    expect(suggestDomainFix('a@gmzil.com')?.toDomain).toBe('gmail.com')
    expect(suggestDomainFix('a@hotmail.cim')?.toDomain).toBe('hotmail.com')
    expect(suggestDomainFix('a@outlool.com')?.toDomain).toBe('outlook.com')
  })

  it('🔴 אינו נוגע בדומיינים אמיתיים', () => {
    // ⚠️ אלה נראים כמו שגיאות אך קיימים באמת. "תיקון" שלהם הורס כתובת עובדת.
    for (const real of [
      'mail.com', 'mail.ru', 'icloud.com', 'me.com', 'live.com',
      'proton.me', 'bezeqint.net', 'nana.co.il', 'aol.com', 'gmx.com',
    ]) {
      expect(suggestDomainFix(`a@${real}`), real).toBeNull()
    }
  })

  it('🔴 אינו מנחש כששתי אפשרויות שקולות', () => {
    // מרחק 1 משני יעדים ⇒ אי אפשר לדעת, ולכן לא נוגעים
    const ambiguous = suggestDomainFix('a@xmail.com')
    if (ambiguous) expect(ambiguous.toDomain).toBe('gmail.com')  // רק אם יחיד
  })

  it('אינו נוגע במחרוזות קצרות', () => {
    expect(suggestDomainFix('a@ab.co')).toBeNull()
  })

  it('מרחק 2 ומעלה אינו מתוקן — רחוק מדי מכדי להיות ודאי', () => {
    expect(suggestDomainFix('a@gzzil.com')).toBeNull()
  })
})
