// צמצום קישור הבדיקה (?preview=) למחלקה אחת.
//
// קישור הבדיקה של הגמ"ח נועד לבדוק הלוואות. כשהוא פתח את כל המחלקות, הבודק
// קיבל באזור האישי גם יולדות וגם סיוע רפואי — כל האפשרויות, במקום זו שבשבילה
// נכנס. הבדיקות כאן מקבעות את הצמצום, ובעיקר את התנהגות הנפילה: ערך לא מוכר
// אינו סוגר את הכל (מסך ריק שנראה כמו תקלה במערכת).
import { describe, it, expect } from 'vitest'
import { previewGates, GATED_DEPARTMENTS } from './departmentGates'

describe('previewGates — צמצום התצוגה המוקדמת', () => {
  it('only=gemach → רק גמ"ח פתוח, כל השאר סגור', () => {
    const gates = previewGates('gemach')
    expect(gates.gemach).toBe(true)
    expect(gates.maternity).toBe(false)
    expect(gates.financial_aid).toBe(false)
    expect(gates.widows).toBe(false)
    expect(gates.holidays).toBe(false)
  })

  it('מצמצם נכון לכל אחת מהמחלקות, לא רק לגמ"ח', () => {
    for (const dept of GATED_DEPARTMENTS) {
      const gates = previewGates(dept)
      const open = GATED_DEPARTMENTS.filter(d => gates[d])
      expect(open).toEqual([dept])
    }
  })

  it('בלי צמצום → כל המחלקות פתוחות (הקישור הכללי נשאר כשהיה)', () => {
    for (const arg of [undefined, null, '']) {
      const gates = previewGates(arg)
      expect(GATED_DEPARTMENTS.every(d => gates[d])).toBe(true)
    }
  })

  it('⚠️ ערך לא מוכר נופל ל"הכל פתוח" ולא ל"הכל סגור"', () => {
    // שם מחלקה שהשתנה או טעות הקלדה בקישור לא ישאירו מסך ריק שנראה כמו באג.
    for (const bad of ['loans', 'GEMACH', 'gemach ', 'לא-קיים']) {
      const gates = previewGates(bad)
      expect(GATED_DEPARTMENTS.every(d => gates[d])).toBe(true)
    }
  })

  it('מחזיר מפתח לכל מחלקה מוגדרת — בלי undefined שיתפרש כסגור', () => {
    const gates = previewGates('maternity')
    for (const dept of GATED_DEPARTMENTS) expect(typeof gates[dept]).toBe('boolean')
  })
})
