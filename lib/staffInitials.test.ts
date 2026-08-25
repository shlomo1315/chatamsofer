import { describe, it, expect } from 'vitest'
import { toInitials, staffDisplayName } from './staffInitials'

// ⚠️ הכלל משרת שני פאנלים (הלוואות ויולדות). שני מימושים היו נסחפים,
// ואותו עובד היה מופיע אחרת בכל מסך.

describe('ראשי תיבות', () => {
  it('🔴 שם פרטי ומשפחה', () => {
    expect(toInitials('משה כהן')).toBe('מ.כ.')
  })

  it('שלושה חלקים', () => {
    expect(toInitials('שרה לאה פרידמן')).toBe('ש.ל.פ.')
  })

  it('⚠️ שם יחיד אינו מקוצר', () => {
    // "מ." לבדה אינה מזהה איש — הקיצור מוחק מידע בלי להסתיר דבר.
    expect(toInitials('מזכירות')).toBe('מזכירות')
    expect(toInitials('דוד')).toBe('דוד')
  })

  it('⚠️ רווחים עודפים אינם יוצרים נקודות ריקות', () => {
    expect(toInitials('  משה   כהן  ')).toBe('מ.כ.')
  })

  it('⚠️ מקף מפצל כמו רווח', () => {
    expect(toInitials('כהן-לוי')).toBe('כ.ל.')
    expect(toInitials('בת-שבע גולד')).toBe('ש.ג.')  // "בת" היא מילית
  })

  it('⚠️ מיליות אינן נספרות', () => {
    // "משה בן דוד" → מ.ד. ולא מ.ב.ד.
    expect(toInitials('משה בן דוד')).toBe('מ.ד.')
    expect(toInitials('יעקב אבן עזרא')).toBe('י.ע.')
  })

  it('⚠️ גרשיים בשם אינם הופכים לראש תיבה', () => {
    expect(toInitials('יצחק צבי כ"ץ')).toBe('י.צ.כ.')
  })

  it('ריק מוחזר ריק', () => {
    expect(toInitials('')).toBe('')
    expect(toInitials(null)).toBe('')
    expect(toInitials(undefined)).toBe('')
  })
})

describe('מה שמוצג ליד הודעת צוות', () => {
  it('🔴 שם עובד מקוצר', () => {
    expect(staffDisplayName('משה כהן')).toBe('מ.כ.')
  })

  it('⚠️ תווית מערכת אינה מקוצרת', () => {
    // "צוות הגמ״ח" כבר אנונימי; "צ.ה." רק היה מבלבל.
    expect(staffDisplayName('צוות הגמ״ח')).toBe('צוות הגמ״ח')
    expect(staffDisplayName('המזכירות')).toBe('המזכירות')
  })

  it('⚠️ ריק נופל לברירת המחדל של הקורא', () => {
    expect(staffDisplayName('', 'המזכירות')).toBe('המזכירות')
    expect(staffDisplayName(null, 'צוות הגמ״ח')).toBe('צוות הגמ״ח')
  })
})

describe('🔴 כתובת מייל → ראשי תיבות', () => {
  it('🔴 מייל עם שם נגזר לראשי תיבות', () => {
    // ⚠️ למשתמשים אין שם ב-Supabase Auth, ולכן sender_name מכיל את
    // המייל. הצגתו כמו שהוא חושפת כתובת פרטית ליולדת.
    expect(staffDisplayName('moshe.cohen@gmail.com')).toBe('M.C.')
    expect(staffDisplayName('yossi_levi@x.co')).toBe('Y.L.')
  })

  it('⚠️ מייל מספרי נופל לתווית המחלקה — ספרה אינה ראש תיבה', () => {
    expect(staffDisplayName('5827799@gmail.com')).toBe('המזכירות')
    expect(staffDisplayName('12345@x.co', 'צוות הגמ״ח')).toBe('צוות הגמ״ח')
  })

  it('⚠️ שם יחיד במייל — אות אחת', () => {
    expect(staffDisplayName('mendel@gmail.com')).toBe('M.')
  })

  it('⚠️ שם אמיתי ממשיך להתקצר', () => {
    expect(staffDisplayName('מנדל שמרלר')).toBe('מ.ש.')
  })

  // ⚠️ הכלל חל על *כל* תצוגות איש הצוות ולא רק על שרשור הבירור: יומן
  // הערות המשפחה, ציר הזמן ובאנר בקשות התיקון הציגו שם מלא.
  it('שם איש צוות אמיתי מהמערכת מקוצר לראשי תיבות', () => {
    expect(staffDisplayName('שלמה ויסברג', 'משתמש')).toBe('ש.ו.')
  })
})
