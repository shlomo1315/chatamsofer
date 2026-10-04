import { describe, it, expect } from 'vitest'
import { parseMagneticCard, looksLikeMagneticSwipe } from './magneticCard'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שדווח: "בסריקה נכנסות 3 ספרות מיותרות למספר הכרטיס, והתוקף
// וה-CVV לא מוזנים". בפועל הקורא משדר את כל הפס כמקלדת, ושדה המספר
// בולע גם את התוקף שאחריו.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 פענוח פס מגנטי', () => {
  it('Track 2 מלא', () => {
    const r = parseMagneticCard(';4580000000000000=2812101000000000000?')
    expect(r?.pan).toBe('4580000000000000')
    // 🔴 הפס הוא YYMM (28=שנה, 12=חודש), ונדרים מצפה ל-MMYY.
    // היפוך הסדר היה שולח תוקף שגוי שנראה תקין לחלוטין.
    expect(r?.tokefMMYY).toBe('1228')
    expect(r?.mm).toBe('12')
    expect(r?.yy).toBe('28')
  })

  it('Track 2 בלי נקודה-פסיק מובילה', () => {
    const r = parseMagneticCard('4580000000000000=2812101')
    expect(r?.pan).toBe('4580000000000000')
    expect(r?.tokefMMYY).toBe('1228')
  })

  it('Track 1 עם שם', () => {
    const r = parseMagneticCard('%B4580000000000000^COHEN/MOSHE^2812101000000000?')
    expect(r?.pan).toBe('4580000000000000')
    expect(r?.tokefMMYY).toBe('1228')
  })

  it('כרטיס 15 ספרות (אמריקן אקספרס)', () => {
    const r = parseMagneticCard(';375514391278378=2805101?')
    expect(r?.pan).toBe('375514391278378')
    expect(r?.tokefMMYY).toBe('0528')
  })

  // 🔴 חודש 13 פירושו שהפענוח שגוי — עדיף להיכשל מאשר לשלוח תוקף
  // מומצא שייחסם בסליקה בלי הסבר.
  it('🔴 חודש לא תקין נדחה', () => {
    expect(parseMagneticCard(';4580000000000000=2813101?')).toBeNull()
    expect(parseMagneticCard(';4580000000000000=2800101?')).toBeNull()
  })

  it('קלט שאינו פס מגנטי מוחזר null', () => {
    expect(parseMagneticCard('4580000000000000')).toBeNull()
    expect(parseMagneticCard('')).toBeNull()
    expect(parseMagneticCard('שלום')).toBeNull()
  })
})

describe('looksLikeMagneticSwipe', () => {
  it('מזהה סריקה', () => {
    expect(looksLikeMagneticSwipe(';4580000000000000=2812101?')).toBe(true)
    expect(looksLikeMagneticSwipe('%B4580000000000000^A/B^2812?')).toBe(true)
  })

  // ⚠️ הקלדה ידנית אסור שתיתפס כסריקה — אחרת המספר היה "מפוענח"
  // ונחתך באמצע.
  it('⚠️ הקלדה ידנית אינה סריקה', () => {
    expect(looksLikeMagneticSwipe('4580000000000000')).toBe(false)
    expect(looksLikeMagneticSwipe('458')).toBe(false)
  })
})
