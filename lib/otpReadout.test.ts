import { describe, it, expect } from 'vitest'
import { spokenCode } from './yemotCall'

// ⚠️ הנקודה '.' היא מפריד הטוקנים של id_list_message בימות. טקסט הקראה
// שמכיל נקודות מפוצל שם לטוקנים נפרדים ("t-קוד הכניסה שלך הוא אחת",
// "שתיים", …) — שברים שאינם טוקנים חוקיים, והתוצאה "שגיאה בהקראה".
// הבדיקות מקבעות את מה שנשלח בפועל לימות.

const TTS_INVALID = /[.,\-"'&|=]/g
const tts = (t: string) => String(t ?? '').replace(TTS_INVALID, ' ').replace(/\s+/g, ' ').trim()
const slowText = (t: string) => tts(t).split(' ').filter(Boolean).join(' , ')

describe('הקראת קוד OTP בימות', () => {
  it('הטקסט הנשלח אינו מכיל נקודות', () => {
    const out = slowText(spokenCode('123456'))
    expect(out).not.toContain('.')
  })

  it('ההפסקות נשמרות כפסיקים (הקראה איטית)', () => {
    const out = slowText(spokenCode('123456'))
    expect(out).toContain(' , ')
    // כל ספרה כמילה בעברית, מופרדת בפסיק
    expect(out).toContain('אחת , שתיים , שלוש')
  })

  it('כל ספרות הקוד מוקראות', () => {
    const out = slowText(spokenCode('907162'))
    for (const w of ['תשע', 'אפס', 'שבע', 'אחת', 'שש', 'שתיים']) {
      expect(out).toContain(w)
    }
  })

  it('החזרה השנייה מכילה את הקוד המלא', () => {
    // ⚠️ ההקראה חוזרת פעמיים. אם החזרה השנייה חסרה ספרות, המאזין
    // שמפספס את הראשונה נשאר בלי קוד תקין.
    const code = '907162'
    const out = slowText(spokenCode(code))
    const words = code.split('').map(d =>
      ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'][Number(d)])
    const seq = words.join(' , ')
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
    const body = `id_list_message=t-${slowText(spokenCode('123456'))}&go_to_folder=hangup&`
    // בדיוק שני פרמטרים — נקודה נוספת הייתה מפצלת את ההודעה
    expect(body.split('&').filter(Boolean)).toHaveLength(2)
    expect(body.startsWith('id_list_message=t-')).toBe(true)
  })
})
