import { describe, it, expect } from 'vitest'
import { decodeEntities, detectKvitelEmail, guessRequestType, isKvitelMailbox, parseKvitelEmailText } from './kvitelEmail'

describe('kvitelEmail', () => {
  it('isKvitelMailbox', () => {
    expect(isKvitelMailbox(['office@chasamsofer.info', 'K@chasamsofer.info'])).toBe(true)
    expect(isKvitelMailbox(['office@chasamsofer.info'])).toBe(false)
  })

  it('guessRequestType', () => {
    expect(guessRequestType('- לרפואה שלמה')).toEqual({ requestType: 'refua', requestNote: null })
    expect(guessRequestType('לזיווג הגון בקרוב')).toEqual({ requestType: 'zivug', requestNote: null })
    expect(guessRequestType('לשלום בית')).toEqual({ requestType: 'other', requestNote: 'לשלום בית' })
    expect(guessRequestType('  ')).toBeNull()
  })

  it('מפענח שורות בתבנית, עם בקשה לכל שורה', () => {
    const p = parseKvitelEmailText('שמות', 'שלום רב,\n1. מאיר בן פעשא לאה - לרפואה שלימה\nשרה בת רחל לזיווג הגון\nבברכה\n--\nמשה כהן')
    expect(p.lines).toEqual([
      { name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua', requestNote: null },
      { name: 'שרה', relation: 'bat', parentName: 'רחל', requestType: 'zivug', requestNote: null },
    ])
    expect(p.flags).toEqual([null, null])
    expect(p.leftover).toEqual([])
  })

  it('בקשה כללית מהנושא, ובלי בקשה בכלל — מסומן', () => {
    expect(parseKvitelEmailText('לרפואה שלמה', 'יעקב בן מרים').lines[0].requestType).toBe('refua')
    const none = parseKvitelEmailText('שמות', 'יעקב בן מרים')
    expect(none.lines[0].requestType).toBe('yeshua')
    expect(none.flags[0]).toContain('לא צוין סוג בקשה')
  })

  it('כמה שמות בשורה אחת, וטקסט שלא פוענח נשמר ב-leftover', () => {
    const p = parseKvitelEmailText('', 'לרפואה שלימה:\nמאיר בן לאה, שרה בת רחל\nהבן שלי שחולה')
    expect(p.lines.map(l => l.name)).toEqual(['מאיר', 'שרה'])
    expect(p.leftover).toEqual(['הבן שלי שחולה'])
  })

  it('קיצורים מהמיילים האמיתיים: לזיווה"ג, לרפו"ש, לזש"ק', () => {
    const p = parseKvitelEmailText('ברצוני לשלוח קויטל לציון זקננו החתם סופר זצוק"ל',
      'חנה בת יטל לזיווה"ג\nשמואל זאנוויל בן מרים איידל לזיווה"ג\nמשה בן שרה לרפו"ש\nדוד בן לאה לזש"ק')
    expect(p.lines.map(l => [l.name, l.parentName, l.requestType])).toEqual([
      ['חנה', 'יטל', 'zivug'], ['שמואל זאנוויל', 'מרים איידל', 'zivug'], ['משה', 'שרה', 'refua'], ['דוד', 'לאה', 'zera'],
    ])
    expect(p.flags).toEqual([null, null, null, null])
  })

  it('ישויות HTML בגוף מפוענחות', () => {
    expect(parseKvitelEmailText('', 'משה בן שרה לרפו&quot;ש').lines[0].requestType).toBe('refua')
    expect(decodeEntities('זצוק&quot;ל &#39;א&#39; &amp;')).toBe('זצוק"ל \'א\' &')
  })

  it('זיהוי מייל קוויטל לפי תיבה או נושא', () => {
    const isOrgAddr = (a: string) => /@chasamsofer\.info$/.test(a)
    const base = { recipients: ['m@chasamsofer.info'], fromEmail: 'ytigross@gmail.com', isOrgAddr }
    expect(detectKvitelEmail({ ...base, subject: 'ברצוני לשלוח קויטל לציון' })).toBe('subject')
    expect(detectKvitelEmail({ ...base, subject: 'קוויטל' })).toBe('subject')
    expect(detectKvitelEmail({ ...base, subject: 'Re: Fwd: קויטל' })).toBeNull()
    expect(detectKvitelEmail({ ...base, subject: 'השב: קויטל' })).toBeNull()
    expect(detectKvitelEmail({ ...base, subject: 'קויטל', fromEmail: 'office@chasamsofer.info' })).toBeNull()
    expect(detectKvitelEmail({ ...base, subject: 'שאלה' })).toBeNull()
    expect(detectKvitelEmail({ ...base, recipients: ['k@chasamsofer.info'], subject: 'שמות' })).toBe('mailbox')
  })

  it('מתעלם מציטוט של מייל קודם', () => {
    expect(parseKvitelEmailText('', 'מאיר בן לאה - הצלחה\n> דוד בן חנה - פרנסה').lines).toHaveLength(1)
  })
})

describe('kvitelEmail: טקסט חופשי', () => {
  it('משפט שנבלע בשם האם נשאר ל-AI ומסומן', () => {
    const p = parseKvitelEmailText('קויטל', 'אשמח אם תוכלו להעביר השם, נתן צבי בן שרה מלכה לתפילה בציון הקדוש')
    expect(p.leftover).toHaveLength(1)
    expect(p.flags[0]).toContain('שם האם ארוך')
  })
})
