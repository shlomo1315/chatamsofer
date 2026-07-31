import { describe, it, expect } from 'vitest'
import { extractUrl } from './extractUrl'

describe('extractUrl — שליפת קישור מטקסט שהודבק', () => {
  it('ההודעה האמיתית שנציגי בתי ההחלמה מדביקים', () => {
    // ⚠️ זה הטקסט המדויק שהם מקבלים ומדביקים. השדה היה input[type=url],
    // דחה את הכל כלא-תקין, והנציג ראה "הקישור אינו תקין" על קישור תקין לגמרי.
    const pasted = 'שלום מונדרי מירי,\nמצורפת חשבונית מס קבלה  מס. 5135523 בקישור https://secure.ezgo.co.il/I?1xV.eG6T'
    expect(extractUrl(pasted)).toBe('https://secure.ezgo.co.il/I?1xV.eG6T')
  })

  it('קישור נקי נשאר כמות שהוא', () => {
    expect(extractUrl('https://secure.ezgo.co.il/I?1xV.eG6T')).toBe('https://secure.ezgo.co.il/I?1xV.eG6T')
    expect(extractUrl('  https://a.co/x.pdf \n')).toBe('https://a.co/x.pdf')
  })

  it('מסיר פיסוק נגרר בסוף משפט', () => {
    expect(extractUrl('הקבלה כאן: https://a.co/x.pdf.')).toBe('https://a.co/x.pdf')
    expect(extractUrl('הנה הקישור https://a.co/x, תודה')).toBe('https://a.co/x')
  })

  it('לא חותך נקודה שהיא חלק מהכתובת', () => {
    // ⚠️ הסרת פיסוק חייבת לחול רק בסוף המחרוזת — אחרת ".eG6T" או ".pdf"
    // היו נחתכים והקישור היה מוביל לשום מקום.
    expect(extractUrl('ראו https://a.co/receipt.pdf')).toBe('https://a.co/receipt.pdf')
    expect(extractUrl('ראו https://secure.ezgo.co.il/I?1xV.eG6T')).toBe('https://secure.ezgo.co.il/I?1xV.eG6T')
  })

  it('מתעלם מסוגריים שעוטפים את הקישור', () => {
    expect(extractUrl('ראו (https://a.co/x.pdf) תודה')).toBe('https://a.co/x.pdf')
    expect(extractUrl('<https://a.co/x.pdf>')).toBe('https://a.co/x.pdf')
  })

  it('מוסיף סכימה לכתובת שהודבקה בלי http', () => {
    // fetch דורש סכימה מלאה — בלי זה "www.x.co/a.pdf" נכשל ב-new URL
    expect(extractUrl('הקבלה: www.example.com/receipt.pdf')).toBe('https://www.example.com/receipt.pdf')
  })

  it('מתמודד עם סימני כיווניות ורווחים בלתי-נראים', () => {
    // ווטסאפ ותוכנות דוא"ל מזריקות תווים כאלה סביב טקסט מעורב עברית/אנגלית.
    // הם אינם נראים למי שהדביק, אך הודבקו לקישור והפכו אותו ללא תקין.
    expect(extractUrl('בקישור ‏https://a.co/x.pdf‎')).toBe('https://a.co/x.pdf')
    expect(extractUrl('קישור: https://a.co/x.pdf')).toBe('https://a.co/x.pdf')
  })

  it('טקסט בלי קישור מוחזר כמות שהוא (לשגיאה מובנת)', () => {
    expect(extractUrl('שלחתי לך את הקבלה במייל')).toBe('שלחתי לך את הקבלה במייל')
    expect(extractUrl('')).toBe('')
    expect(extractUrl(null)).toBe('')
  })

  it('שולף את הקישור הראשון כשיש כמה', () => {
    expect(extractUrl('ראשון https://a.co/1.pdf ואז https://b.co/2.pdf')).toBe('https://a.co/1.pdf')
  })
})
