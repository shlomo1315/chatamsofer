import { describe, it, expect } from 'vitest'
import { docKeysToHebrew } from './docKeysHebrew'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 required_docs נשמר כמפתחות מופרדים בפסיקים ("id_husband,id_wife"),
// והוצג כך גם למזכירה. היא רואה מחרוזת באנגלית ולא יודעת אילו מסמכים
// התבקשו בפועל.
//
// ⚠️ מפתח שאינו מוכר מוצג כפי שהוא ולא נבלע: סוג שנוסף מההגדרות ונמחק
// אחר כך עדיין צריך להיראות, אחרת השורה נעלמת בשקט.
// ─────────────────────────────────────────────────────────────────────────────

describe('docKeysToHebrew', () => {
  it('🔴 מתרגם את המפתחות לעברית', () => {
    expect(docKeysToHebrew('id_husband,id_husband_appx,id_wife'))
      .toBe('ת.ז. הבעל · ספח ת.ז. הבעל · ת.ז. האישה')
  })

  it('מפתח בודד', () => {
    expect(docKeysToHebrew('id_wife')).toBe('ת.ז. האישה')
  })

  it('⚠️ רווחים סביב הפסיקים', () => {
    expect(docKeysToHebrew(' id_husband , id_wife ')).toBe('ת.ז. הבעל · ת.ז. האישה')
  })

  it('מסמכי מערכת מקבלים שם עברי', () => {
    expect(docKeysToHebrew('birth_cert')).toBe('אישור לידה')
  })

  it('⚠️ מפתח לא מוכר מוצג כפי שהוא — לא נבלע', () => {
    expect(docKeysToHebrew('doc_a1b2c3')).toBe('doc_a1b2c3')
  })

  it('ריק → ריק', () => {
    expect(docKeysToHebrew('')).toBe('')
    expect(docKeysToHebrew(null)).toBe('')
    expect(docKeysToHebrew(undefined)).toBe('')
  })

  it('⚠️ פסיקים מיותרים אינם יוצרים פריטים ריקים', () => {
    expect(docKeysToHebrew('id_wife,,')).toBe('ת.ז. האישה')
  })
})
