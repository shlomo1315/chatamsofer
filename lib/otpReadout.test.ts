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
const PAUSE_TOKENS_BETWEEN_DIGITS = 1
const DIGIT_TAIL = ' , , ,'
function slowTokens(text: string): string {
  const words = tts(text).split(' ').filter(Boolean)
  const tokens: string[] = []
  let buf: string[] = []
  let lastWasDigit = false
  const flush = () => { if (buf.length) { tokens.push(`t-${buf.join(' ')}`); buf = [] } }
  for (const w of words) {
    if (DIGIT_SET.has(w)) {
      flush()
      // בין שתי ספרות — טוקני-פסיק נפרדים (הפסקה מובטחת מימות בין טוקנים)
      for (let i = 0; i < PAUSE_TOKENS_BETWEEN_DIGITS; i++) tokens.push('t-,')
      tokens.push(`t-${w}${DIGIT_TAIL}`)
      lastWasDigit = true
    } else { buf.push(w); lastWasDigit = false }
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
    // זה מנגנון ההאטה: ימות עוצרת בין הודעה להודעה, + פסיק בסוף כל ספרה
    // להפסקה קצרה נוספת (כמו yemot-maternity).
    const out = slowTokens(spokenCode('123456'))
    const tokens = out.split('.')
    for (const w of ['אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש']) {
      // כל ספרה טוקן משלה, עם פסיקי-השהיה בסופו
      expect(tokens).toContain(`t-${w}${DIGIT_TAIL}`)
    }
    // בין הספרות יש טוקני-פסיק להשהיה
    expect(tokens.filter(t => t === 't-,').length).toBeGreaterThanOrEqual(6)
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
    for (const d of code.split('')) {
      const w = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'][Number(d)]
      // כל ספרה מופיעה כטוקן משלה, פעמיים (שתי ההקראות)
      expect(out.split(`t-${w}${DIGIT_TAIL}`).length - 1).toBeGreaterThanOrEqual(2)
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// השיחה היוצאת (המערכת מתקשרת ומקריאה את הקוד) — מסלול *אחר* לגמרי מהשלוחה:
// מחרוזת טקסט אחת, בלי טוקנים ובלי id_list_message. ⚠️ כל ההאטות שנעשו בשלוחה
// לא השפיעו עליו כלל, והקוד הוקרא כמילים רצופות במהירות. ההשהיה היחידה שאפשרית
// כאן היא פיסוק בתוך הטקסט — ולכן הפסיקים חייבים לשרוד את הניקוי.
// ─────────────────────────────────────────────────────────────────────────────
describe('הקראת קוד בשיחה יוצאת', () => {
  // עותק מדויק של ttsSafe ב-lib/yemotCall.ts
  const ttsSafe = (t: string) => String(t ?? '')
    .replace(/[.,\-"'&|=]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  it('אין פסיק — פסיק קוטע את ההודעה ומנתק את השיחה', () => {
    // ⚠️ תקלה חיה שהייתה: ימות מפצלת את הטקסט האישי בפסיקים למשתני התבנית,
    // ותבנית עם משתנה אחד מקריאה רק את מה שלפני הפסיק הראשון. השיחה הקריאה
    // "הקוד שלכם הוא" והתנתקה.
    const out = spokenCode('907162')
    expect(out).not.toContain(',')
    expect(ttsSafe(out)).not.toContain(',')
  })

  it('אין נקודה — ימות משהה ~15 שניות לפניה', () => {
    expect(spokenCode('907162')).not.toContain('.')
  })

  it('הפתיח קצר ומיידי: "הקוד שלכם הוא"', () => {
    const out = spokenCode('907162')
    expect(out).toContain('הקוד שלכם הוא')
    // מילת-חיץ אחת בלבד לפני המשפט — תחילת ההקראה נבלעת בזמן שהקו מתייצב
    expect(out.startsWith('שלום הקוד שלכם הוא')).toBe(true)
  })

  it('מוקראות ספרות בלבד — בלי מילות מקום', () => {
    const out = spokenCode('907162')
    expect(out).not.toContain('ספרה')
    expect(out).not.toMatch(/ראשונה|שנייה|שלישית|רביעית|חמישית|שישית/)
  })

  it('יש מפריד השהיה בין ספרה לספרה', () => {
    const out = spokenCode('907162')
    // בין כל שתי ספרות עוקבות יש מפריד — אחרת ההקראה רצופה ולא נשמעת
    expect(out).toMatch(/תשע\s*;\s*אפס\s*;\s*שבע/)
    // חמישה מפרידים בכל הקראה של קוד בן שש ספרות, פעמיים
    expect((out.match(/;/g) ?? []).length).toBe(10)
  })

  it('כל ספרות הקוד מוקראות, פעמיים', () => {
    const out = spokenCode('907162')
    for (const w of ['תשע', 'אפס', 'שבע', 'אחת', 'שש', 'שתיים']) {
      expect(out.split(w).length - 1).toBeGreaterThanOrEqual(2)
    }
    expect(out).toContain('ואני חוזר שנית')
  })
})
