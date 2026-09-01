import { describe, it, expect } from 'vitest'
import { toRegistrationRow } from './distributionRow'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הרגרסיה: "בחרתי מוקד באתר וזה לא נקלט".
//
// המוקד נשמר כראוי במסד (center_id מלא, center_source='portal'), אבל
// בטבלת הנרשמים נכתב "טרם נבחר". השורש: Supabase מחזיר join מקונן
// כ*מערך* או כאובייקט, והמיפוי ניגש ישירות ל-`.city` — כלומר undefined
// על מערך, בלי שום שגיאה.
//
// ⚠️ הטיפוס לא תפס את זה: הוא הצהיר על אובייקט בלבד, וההצהרה הייתה
// שקרית. זו אותה מלכודת שהפילה כבר את מחיקת הכרטיס המגנטי.
// ─────────────────────────────────────────────────────────────────────────────

const base = { id: 'r1', beneficiary: { family_name: 'כהן' } }

describe('🔴 שם המוקד — מערך או אובייקט', () => {
  it('join שמוחזר כמערך (הצורה שהפילה את המסך)', () => {
    const row = toRegistrationRow({
      ...base, center_id: 'c1',
      center: [{ id: 'c1', city: 'ירושלים', name: 'אזור שמואל הנביא' }],
    })
    expect(row.center_name).toBe('ירושלים · אזור שמואל הנביא')
  })

  it('join שמוחזר כאובייקט', () => {
    const row = toRegistrationRow({
      ...base, center_id: 'c1',
      center: { id: 'c1', city: 'ירושלים', name: 'אזור שמואל הנביא' },
    })
    expect(row.center_name).toBe('ירושלים · אזור שמואל הנביא')
  })

  it('עיר ששמה זהה לשם המוקד אינה מוצגת פעמיים', () => {
    const row = toRegistrationRow({
      ...base, center_id: 'c1',
      center: [{ id: 'c1', city: 'אלעד', name: 'אלעד' }],
    })
    expect(row.center_name).toBe('אלעד')
  })
})

describe('היעדר מוקד', () => {
  it('אין מוקד — null ולא "undefined · undefined"', () => {
    expect(toRegistrationRow({ ...base, center: null }).center_name).toBeNull()
  })

  it('מערך ריק', () => {
    expect(toRegistrationRow({ ...base, center: [] }).center_name).toBeNull()
  })

  it('השדה חסר לגמרי', () => {
    expect(toRegistrationRow(base).center_name).toBeNull()
  })

  it('אובייקט בלי שדות — לא מחזיר מחרוזת של undefined', () => {
    const row = toRegistrationRow({ ...base, center: [{}] })
    expect(row.center_name).toBeNull()
  })
})

describe('נתונים חלקיים אינם מייצרים מפריד מיותר', () => {
  it('שם בלי עיר', () => {
    expect(toRegistrationRow({ ...base, center: [{ name: 'בית הכנסת' }] }).center_name)
      .toBe('בית הכנסת')
  })

  it('עיר בלי שם', () => {
    expect(toRegistrationRow({ ...base, center: [{ city: 'חיפה' }] }).center_name)
      .toBe('חיפה')
  })
})
