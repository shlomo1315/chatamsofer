import { describe, it, expect } from 'vitest'
import { roleAllows, effectiveLevel, levelAllows, sectionVisible, ALL_SECTIONS } from './permissions'
import type { UserPermissions } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// הרגרסיה שהטסטים האלה נועדו למנוע:
//
// משתמש שסומן לו 'הלוואות' בלבד ראה גם מיילים, אלמנות וניוזלטר. שלושה
// כשלים נפרדים הצטברו לתמונה אחת:
//   1. ברירת המחדל בסרגל הייתה מתירנית — מחלקה ללא סימון נחשבה מותרת.
//   2. widows/newsletter כלל לא הופיעו במסך הסימון, ולכן *לעולם* לא סומנו
//      ונפלו תמיד לברירת המחדל הזו.
//   3. 'mail' לא היה מפתח הרשאה בכלל — מסלולי המייל בדקו רק "איש צוות?".
//
// לכן הטסטים כאן נוגעים במפורש בשלוש המחלקות החדשות ולא רק במנגנון הכללי:
// מנגנון תקין עם מפתח חסר הוא בדיוק המצב שדלף.
// ─────────────────────────────────────────────────────────────────────────────

const loansOnly: UserPermissions = { loans: 'edit' }

describe('ברירת מחדל סגורה', () => {
  it('מחלקה ללא סימון כלל — חסומה, לא מותרת', () => {
    expect(roleAllows('reviewer', loansOnly, 'widows', 'view')).toBe(false)
    expect(roleAllows('reviewer', loansOnly, 'newsletter', 'view')).toBe(false)
    expect(roleAllows('reviewer', loansOnly, 'mail', 'view')).toBe(false)
  })

  it('המחלקה שסומנה — פתוחה', () => {
    expect(roleAllows('reviewer', loansOnly, 'loans', 'edit')).toBe(true)
  })

  it('sectionVisible חוסם מחלקה ללא סימון — הסרגל אינו מרכך', () => {
    // ⚠️ הסרגל היה בעבר מתירני יותר מהשרת (?? 'view'), כך שפריט הוצג
    // למי שה-API היה דוחה אותו. שתי ההכרעות חייבות להיות זהות.
    expect(sectionVisible(false, 'reviewer', loansOnly, 'widows')).toBe(false)
    expect(sectionVisible(false, 'reviewer', loansOnly, 'newsletter')).toBe(false)
    expect(sectionVisible(false, 'reviewer', loansOnly, 'mail')).toBe(false)
    expect(sectionVisible(false, 'reviewer', loansOnly, 'loans')).toBe(true)
  })

  it('מנהל רואה הכל — גם ללא מטריצה', () => {
    for (const s of ALL_SECTIONS) {
      expect(sectionVisible(true, 'admin', {}, s.key)).toBe(true)
    }
  })

  it('פריט ללא section (לוח בקרה בעבר) אינו נבדק — הבדיקה על המפתח בלבד', () => {
    expect(sectionVisible(false, 'reviewer', loansOnly, undefined)).toBe(true)
  })
})

describe('mail כמחלקה מלאה', () => {
  it("'mail' נכלל ברשימת המחלקות שהממשק מציג לסימון", () => {
    // בלי זה — אין דרך בממשק לסמן, ומה שלא ניתן לסמן דולף.
    const keys = ALL_SECTIONS.map(s => s.key)
    expect(keys).toContain('mail')
    expect(keys).toContain('widows')
    expect(keys).toContain('newsletter')
  })

  it('סימון מפורש של mail פותח גישה', () => {
    expect(roleAllows('secretary', { mail: 'view' }, 'mail', 'view')).toBe(true)
    expect(roleAllows('secretary', { mail: 'view' }, 'mail', 'edit')).toBe(false)
  })
})

describe('רצפת התפקיד בוטלה — הסימון הוא מקור האמת', () => {
  it('מזכירות ללא סימון — אין גישה לשום מחלקה', () => {
    // 🔴 עד כה מזכירה קיבלה צאצאים וחלוקות חגים אוטומטית. סימון 'ללא'
    // לא נאכף, והמסך הראה מצב שאינו המצב בפועל.
    expect(roleAllows('secretary', {}, 'beneficiaries', 'view')).toBe(false)
    expect(roleAllows('secretary', {}, 'distributions', 'view')).toBe(false)
  })

  it("סימון מפורש של 'ללא' חוסם", () => {
    expect(roleAllows('secretary', { beneficiaries: 'none' }, 'beneficiaries', 'view')).toBe(false)
    expect(roleAllows('secretary', { distributions: 'none' }, 'distributions', 'view')).toBe(false)
  })

  it('סימון מפורש פותח בדיוק את מה שסומן', () => {
    expect(effectiveLevel('secretary', { distributions: 'edit' }, 'distributions')).toBe('edit')
    expect(roleAllows('secretary', { beneficiaries: 'view' }, 'beneficiaries', 'view')).toBe(true)
    expect(roleAllows('secretary', { beneficiaries: 'view' }, 'beneficiaries', 'edit')).toBe(false)
  })

  it('מחלקות שלא סומנו נשארות סגורות', () => {
    expect(roleAllows('secretary', { loans: 'add' }, 'widows', 'view')).toBe(false)
    expect(roleAllows('secretary', { loans: 'add' }, 'newsletter', 'view')).toBe(false)
    expect(roleAllows('secretary', { loans: 'add' }, 'mail', 'view')).toBe(false)
    expect(roleAllows('secretary', { loans: 'add' }, 'loans', 'add')).toBe(true)
  })
})

describe('levelAllows — סדר הרמות', () => {
  it('edit מתיר מחיקה, add לא', () => {
    expect(levelAllows('edit', 'delete')).toBe(true)
    expect(levelAllows('add', 'delete')).toBe(false)
  })

  it('undefined = none', () => {
    expect(levelAllows(undefined, 'view')).toBe(false)
  })
})
