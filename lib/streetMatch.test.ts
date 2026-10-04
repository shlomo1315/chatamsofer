import { describe, it, expect } from 'vitest'
import { normalizeStreet, houseNumber, matchStreet } from './streetMatch'

// רחובות אמיתיים מהמאגר (bnei brak / jerusalem)
const STREETS = [
  'בית ישראל', 'רבי עקיבא', 'הרב קוק', 'חזון איש', 'ירמיהו',
  'אהרונוביץ', 'סורוצקין', 'מלכי ישראל', 'שמואל הנביא',
]

describe('normalizeStreet', () => {
  it('מסיר מילות קישור שהתמלול מוסיף', () => {
    expect(normalizeStreet('רחוב רבי עקיבא')).toBe('רבי עקיבא')
    expect(normalizeStreet("רח' חזון איש")).toBe('חזון איש')
    expect(normalizeStreet('שדרות ירמיהו')).toBe('ירמיהו')
  })

  it('מסיר מספר בית מהסוף', () => {
    expect(normalizeStreet('רחוב בית ישראל 32')).toBe('בית ישראל')
    expect(normalizeStreet('רבי עקיבא מספר 5')).toBe('רבי עקיבא')
  })

  // ⚠️ "בית" הוא גם מילת רעש וגם תחילת שם רחוב.
  it('"בית" נשמר כשהוא חלק מהשם', () => {
    expect(normalizeStreet('בית ישראל')).toBe('בית ישראל')
    expect(normalizeStreet('רחוב בית ישראל')).toBe('בית ישראל')
  })

  it('גרשיים ותווי כיווניות אינם שוברים השוואה', () => {
    expect(normalizeStreet('חזו"ן איש')).toBe('חזון איש')
    expect(normalizeStreet('‏רבי עקיבא')).toBe('רבי עקיבא')
  })
})

describe('houseNumber', () => {
  it('מחלץ את מספר הבית', () => {
    expect(houseNumber('רחוב בית ישראל 32')).toBe('32')
    expect(houseNumber('רבי עקיבא 115 דירה 4')).toBe('115')
  })
  it('null כשלא נאמר מספר', () => {
    expect(houseNumber('רחוב בית ישראל')).toBeNull()
  })
})

describe('matchStreet', () => {
  it('התאמה מדויקת', () => {
    expect(matchStreet('רחוב בית ישראל 32', STREETS))
      .toEqual({ street: 'בית ישראל', kind: 'exact' })
  })

  // 🔴 המקרה שבגללו הפונקציה קיימת: תמלול טלפוני עם שגיאת תו.
  it('שגיאת תמלול של תו אחד', () => {
    expect(matchStreet('רבי עקיבה', STREETS)?.street).toBe('רבי עקיבא')
    expect(matchStreet('סורצקין', STREETS)?.street).toBe('סורוצקין')
  })

  it('הכלה — חלק מהשם', () => {
    expect(matchStreet('שמואל הנביא 10', STREETS)?.street).toBe('שמואל הנביא')
  })

  // 🔴 ריבוי מועמדים = לא זוהה. בחירה שרירותית שולחת לכתובת שגויה.
  it('מחזיר null כששתי התאמות סבירות', () => {
    const ambiguous = ['הרב קוק', 'הרב מימון']
    expect(matchStreet('הרב', ambiguous)).toBeNull()
  })

  it('מחזיר null לרחוב שאינו קיים', () => {
    expect(matchStreet('רחוב שלא קיים בכלל', STREETS)).toBeNull()
  })

  it('מחזיר null לתמלול ריק או קצר מדי', () => {
    expect(matchStreet('', STREETS)).toBeNull()
    expect(matchStreet('רחוב', STREETS)).toBeNull()
  })
})
