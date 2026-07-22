import { describe, it, expect } from 'vitest'
import { spokenCode } from './yemotCall'

// ⚠️ הנקודה '.' היא מפריד הטוקנים של id_list_message בימות. טקסט הקראה
// שמכיל נקודות מפוצל שם לטוקנים נפרדים ("t-קוד הכניסה שלך הוא אחת",
// "שתיים", …) — שברים שאינם טוקנים חוקיים, והתוצאה "שגיאה בהקראה".
// הבדיקות מקבעות את מה שנשלח בפועל לימות.

// עותק מדויק של הלוגיקה ב-app/api/webhooks/yemot-otp/route.ts.
// ⚠️ אם משנים שם — לעדכן גם כאן, אחרת הבדיקות מקבעות התנהגות ישנה.
const TTS_INVALID = /[.,\-"'&|=]/g
const tts = (t: string) => String(t ?? '').replace(TTS_INVALID, ' ').replace(/\s+/g, ' ').trim()
const DIGIT_SET = new Set(['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'])
function slowTokens(text: string): string {
  const words = tts(text).split(' ').filter(Boolean)
  const tokens: string[] = []
  let buf: string[] = []
  const flush = () => { if (buf.length) { tokens.push(`t-${buf.join(' ')}`); buf = [] } }
  for (const w of words) {
    if (DIGIT_SET.has(w)) { flush(); tokens.push(`t-${w}`) }
    else buf.push(w)
  }
  flush()
  return tokens.join('.')
}

describe('הקראת קוד OTP בימות', () => {
  it('אין נקודות בתוך הטקסט עצמו — רק כמפריד בין טוקנים', () => {
    // ⚠️ הנקודה חוקית *בין* טוקנים, אך אסורה בתוך טקסט הודעה (תיעוד ימות).
    const out = slowTokens(spokenCode('123456'))
    for (const token of out.split('.')) {
      expect(token.startsWith('t-')).toBe(true)
      expect(token.slice(2)).not.toContain('.')
    }
  })

  it('כל ספרה היא הודעה נפרדת — הפסקה מלאה ביניהן', () => {
    // זה מנגנון ההאטה: ימות עוצרת בין הודעה להודעה. פסיקים נשמעים כטקסט.
    const out = slowTokens(spokenCode('123456'))
    const tokens = out.split('.')
    for (const w of ['אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש']) {
      expect(tokens).toContain(`t-${w}`)   // טוקן משלה, לא חלק ממשפט
    }
  })

  it('כל ספרות הקוד מוקראות', () => {
    const out = slowTokens(spokenCode('907162'))
    for (const w of ['תשע', 'אפס', 'שבע', 'אחת', 'שש', 'שתיים']) {
      expect(out).toContain(w)
    }
  })

  it('החזרה השנייה מכילה את הקוד המלא', () => {
    // ⚠️ ההקראה חוזרת פעמיים. אם החזרה השנייה חסרה ספרות, המאזין
    // שמפספס את הראשונה נשאר בלי קוד תקין.
    const code = '907162'
    const out = slowTokens(spokenCode(code))
    const words = code.split('').map(d =>
      ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'][Number(d)])
    const seq = words.map(w => `t-${w}`).join('.')
    expect(out.split(seq).length - 1).toBe(2)   // רצף הספרות המלא, פעמיים
  })

  it('יש מילות חיץ לפני הספרה הראשונה', () => {
    // ⚠️ תחילת ההקראה נבלעת בזמן שהקו מתייצב אחרי המענה. בלי מילות חיץ
    // לפני הקוד, הספרה הראשונה נחתכה וההקראה הראשונה נשמעה בת 5 ספרות.
    const out = spokenCode('907162')
    const firstDigit = out.indexOf('תשע')
    const prefix = out.slice(0, firstDigit).trim().split(/\s+/).filter(Boolean)
    // לפחות 4 מילים לפני הספרה הראשונה — מרווח בטוח לחיתוך
    expect(prefix.length).toBeGreaterThanOrEqual(4)
  })

  it('גוף התשובה לימות נשאר פרמטר יחיד ותקין', () => {
    const body = `id_list_message=${slowTokens(spokenCode('123456'))}&go_to_folder=hangup&`
    // בדיוק שני פרמטרים — & נוסף היה מפצל את הפקודה
    expect(body.split('&').filter(Boolean)).toHaveLength(2)
    expect(body.startsWith('id_list_message=t-')).toBe(true)
  })
})
