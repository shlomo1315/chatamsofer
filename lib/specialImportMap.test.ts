import { describe, it, expect } from 'vitest'
import {
  autoMapColumns, missingRequired, normalizeHeader, cleanIdNumber, cleanPhone,
} from './specialImportMap'

describe('normalizeHeader', () => {
  it('מנרמל גרשיים, נקודות ורווחים לצורה אחת', () => {
    expect(normalizeHeader('ת.ז')).toBe('ת ז')
    expect(normalizeHeader('ת״ז')).toBe('תז')
    expect(normalizeHeader('  שם   מלא  ')).toBe('שם מלא')
    expect(normalizeHeader('E-Mail')).toBe('e mail')
  })
})

describe('autoMapColumns', () => {
  it('מזהה כותרות עבריות רגילות', () => {
    const m = autoMapColumns(['שם משפחה', 'שם פרטי', 'ת.ז', 'טלפון', 'עיר'])
    expect(m[0]).toBe('family_name')
    expect(m[1]).toBe('full_name')
    expect(m[2]).toBe('id_number')
    expect(m[3]).toBe('phone')
    expect(m[4]).toBe('city')
  })

  // 🔴 הבאג המסוכן ביותר בייבוא: התאמה חלקית שגונבת שדה אחר. "שם האישה"
  // מכיל "שם", ובלי עדיפות להתאמה מדויקת הוא היה נכנס ל-full_name —
  // כלומר שם האישה נשמר כשם המבקש, בלי שום שגיאה גלויה.
  it('🔴 לא מבלבל בין "שם" ל"שם האישה"', () => {
    const m = autoMapColumns(['שם', 'שם האישה'])
    expect(m[0]).toBe('full_name')
    expect(m[1]).toBe('spouse_name')
  })

  it('🔴 לא מבלבל בין ת.ז לת.ז של בן הזוג', () => {
    const m = autoMapColumns(['ת.ז', 'ת.ז אישה'])
    expect(m[0]).toBe('id_number')
    expect(m[1]).toBe('spouse_id_number')
  })

  // שדה שכבר שובץ לא נלקח שוב — אחרת העמודה השנייה דורסת את הראשונה.
  it('לא ממפה שני עמודות לאותו שדה', () => {
    const m = autoMapColumns(['שם', 'שם מלא'])
    const values = Object.values(m)
    expect(new Set(values).size).toBe(values.length)
  })

  it('מתעלם מעמודות ריקות או לא מזוהות', () => {
    const m = autoMapColumns(['ת.ז', '', 'עמודה משונה', 'טלפון'])
    expect(m[0]).toBe('id_number')
    expect(m[1]).toBeUndefined()
    expect(m[2]).toBeUndefined()
    expect(m[3]).toBe('phone')
  })

  it('מזהה גם כותרות באנגלית', () => {
    const m = autoMapColumns(['ID', 'Name', 'Phone', 'Email'])
    expect(m[0]).toBe('id_number')
    expect(m[1]).toBe('full_name')
    expect(m[2]).toBe('phone')
    expect(m[3]).toBe('email')
  })
})

describe('missingRequired', () => {
  it('מדווח על שדה חובה חסר', () => {
    expect(missingRequired(autoMapColumns(['טלפון', 'עיר']))).toEqual(['id_number', 'full_name'])
  })

  it('מחזיר ריק כששני שדות החובה קיימים', () => {
    expect(missingRequired(autoMapColumns(['ת.ז', 'שם']))).toEqual([])
  })
})

describe('cleanIdNumber', () => {
  // ⚠️ אקסל מפיל אפסים מובילים. בלי ההשלמה כל ת"ז כזו הייתה נחשבת אדם חדש.
  it('🔴 משלים אפסים מובילים ל-9 ספרות', () => {
    expect(cleanIdNumber(12345678)).toBe('012345678')
    expect(cleanIdNumber('12345678')).toBe('012345678')
  })

  it('מסיר מקפים ורווחים', () => {
    expect(cleanIdNumber('123-456-789')).toBe('123456789')
    expect(cleanIdNumber(' 123456789 ')).toBe('123456789')
  })

  it('מחזיר ריק לערך ריק', () => {
    expect(cleanIdNumber('')).toBe('')
    expect(cleanIdNumber(null)).toBe('')
    expect(cleanIdNumber('אבג')).toBe('')
  })
})

describe('cleanPhone', () => {
  it('משאיר ספרות בלבד', () => {
    expect(cleanPhone('052-123-4567')).toBe('0521234567')
  })

  it('שומר על קידומת בינלאומית', () => {
    expect(cleanPhone('+1 718 555 1234')).toBe('+17185551234')
  })

  it('מחזיר ריק לערך ריק', () => {
    expect(cleanPhone(null)).toBe('')
  })
})
