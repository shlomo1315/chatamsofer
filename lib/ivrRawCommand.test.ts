import { describe, it, expect } from 'vitest'
import { sanitizeRawCommand, RAW_COMMAND_HINT } from './ivrRawCommand'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שלוחה מסוג "פקודה חופשית" — הדלת לכל 40 סוגי השלוחות של ימות.
//
// ⚠️ במקום לבנות סוג-סוג (תא קולי, פקס, פילטר זמנים, זמני היום…),
// המנהל מדביק את הפקודה מהתיעוד של ימות. כך כל סוג זמין מיד, גם
// כזה שימות תוסיף בעתיד.
//
// 🔴 אבל פקודה חופשית שנכתבת ישירות לתשובה היא הזרקה: תו אחד שגוי
// שובר את *כל* התשובה, וכל המתקשרים שומעים שגיאה — לא רק בשלוחה הזו.
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeRawCommand — 🔴 מה מותר לעבור', () => {
  it('פקודה תקינה עוברת כמות שהיא', () => {
    expect(sanitizeRawCommand('go_to_folder=/7')).toBe('go_to_folder=/7')
    expect(sanitizeRawCommand('id_list_message=t-שלום')).toBe('id_list_message=t-שלום')
  })

  it('רווחים מסביב נחתכים', () => {
    expect(sanitizeRawCommand('  go_to_folder=/7  ')).toBe('go_to_folder=/7')
  })

  it('🔴 & נחסם — הוא מפריד פקודות, ומאפשר להזריק פקודה נוספת', () => {
    expect(sanitizeRawCommand('go_to_folder=/7&go_to_folder=hangup')).toBeNull()
  })

  it('🔴 שורה חדשה נחסמת — שוברת את גוף התשובה', () => {
    expect(sanitizeRawCommand('go_to_folder=/7\nid_list_message=x')).toBeNull()
  })

  it('⚠️ בלי סימן שווה — אינה פקודה כלל', () => {
    expect(sanitizeRawCommand('go_to_folder')).toBeNull()
    expect(sanitizeRawCommand('סתם טקסט')).toBeNull()
  })

  it('⚠️ ריק → null, ולא מחרוזת ריקה שתיכתב לתשובה', () => {
    expect(sanitizeRawCommand('')).toBeNull()
    expect(sanitizeRawCommand(null)).toBeNull()
    expect(sanitizeRawCommand(undefined)).toBeNull()
  })

  it('⚠️ שם הפקודה חייב להיות אותיות לטיניות/קו תחתון בלבד', () => {
    expect(sanitizeRawCommand('go to folder=/7')).toBeNull()
    expect(sanitizeRawCommand('=ערך')).toBeNull()
  })

  it('אורך חריג נחסם — פקודה של אלפי תווים אינה אמיתית', () => {
    expect(sanitizeRawCommand('x=' + 'a'.repeat(5000))).toBeNull()
  })

  it('סוגי שלוחות אמיתיים מהתיעוד עוברים', () => {
    // ⚠️ אלה הפקודות שהמנהל יעתיק בפועל מהתיעוד של ימות.
    for (const cmd of [
      'go_to_folder=/voicemail',
      'routing_yemot=0722222222',
      'record=t-נא להשאיר הודעה=rec,yes,,,,,,,,',
    ]) {
      expect(sanitizeRawCommand(cmd), cmd).toBe(cmd)
    }
  })
})

describe('ההסבר למנהל', () => {
  it('מפנה לתיעוד ולא מניח ידע מוקדם', () => {
    expect(RAW_COMMAND_HINT).toContain('ימות')
  })
})
