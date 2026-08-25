import { describe, it, expect } from 'vitest'
import { nedarimIdOf, type UnloadableAid } from './unloadExpired'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מזהה המשפחה בנדרים — שדה אחד שממנו תלויים שני דברים:
//   · שליפת היתרה שנשמרת כ"כמה חזר לארנק"
//   · מחיקת הכרטיס המגנטי, שבלעדיה הלידה הבאה לא מקבלת כרטיס חדש
//
// ⚠️ שלושת הקוראים מעבירים את השורה עם `as unknown as UnloadableAid`,
// שעוקף לחלוטין את בדיקת הטיפוס. join של Supabase מחזיר לפעמים מערך
// ולפעמים אובייקט, וגישה ישירה על מערך מחזירה undefined *בשקט*.
// ─────────────────────────────────────────────────────────────────────────────

const aid = (b: UnloadableAid['beneficiary']): UnloadableAid =>
  ({ id: 'x', beneficiary: b })

describe('חילוץ מזהה נדרים', () => {
  it('אובייקט', () => {
    expect(nedarimIdOf(aid({ nedarim_id: '12345' }))).toBe('12345')
  })

  it('🔴 מערך — הצורה שהפילה את שני השימושים בשקט', () => {
    expect(nedarimIdOf(aid([{ nedarim_id: '12345' }]))).toBe('12345')
  })

  it('⚠️ חסר מוחזר null ולא מחרוזת ריקה', () => {
    // מחרוזת ריקה הייתה נשלחת לנדרים כמזהה תקין.
    expect(nedarimIdOf(aid(null))).toBeNull()
    expect(nedarimIdOf(aid(undefined))).toBeNull()
    expect(nedarimIdOf(aid([]))).toBeNull()
    expect(nedarimIdOf(aid({}))).toBeNull()
    expect(nedarimIdOf(aid({ nedarim_id: null }))).toBeNull()
    expect(nedarimIdOf(aid({ nedarim_id: '' }))).toBeNull()
    expect(nedarimIdOf(aid({ nedarim_id: '   ' }))).toBeNull()
  })

  it('⚠️ רווחים נחתכים', () => {
    expect(nedarimIdOf(aid({ nedarim_id: ' 12345 ' }))).toBe('12345')
  })

  it('⚠️ מזהה מספרי מומר למחרוזת', () => {
    // PostgREST מחזיר לעתים מספר; String() בקריאה עצמה כבר לא היה עוזר
    // אילו החילוץ החזיר undefined.
    expect(nedarimIdOf(aid({ nedarim_id: 12345 as unknown as string }))).toBe('12345')
  })
})
