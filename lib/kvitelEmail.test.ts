import { describe, it, expect } from 'vitest'
import { guessRequestType, isKvitelMailbox, parseKvitelEmailText } from './kvitelEmail'

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

  it('מתעלם מציטוט של מייל קודם', () => {
    expect(parseKvitelEmailText('', 'מאיר בן לאה - הצלחה\n> דוד בן חנה - פרנסה').lines).toHaveLength(1)
  })
})
