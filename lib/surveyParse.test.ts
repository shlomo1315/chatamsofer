import { describe, it, expect } from 'vitest'
import { stripQuotedReply, parseScores } from './surveyParse'

describe('stripQuotedReply', () => {
  it('מסיר ציטוט בסגנון Gmail', () => {
    const raw = 'תשובה שלי\n\nOn Sun, Jul 12, 2026 at 9:00 AM היכל החתם סופר <office@x.com> wrote:\n> טקסט ישן'
    expect(stripQuotedReply(raw)).toBe('תשובה שלי')
  })

  it('מסיר שורות שמתחילות ב->', () => {
    expect(stripQuotedReply('חדש\n> ישן\n> עוד ישן')).toBe('חדש')
  })

  it('מסיר ציטוט בעברית', () => {
    const raw = 'הטקסט שלי\n\nבתאריך יום א׳, 12 ביולי 2026, היכל החתם סופר כתב:\nישן'
    expect(stripQuotedReply(raw)).toBe('הטקסט שלי')
  })

  it('מסיר ציטוט Gmail בעברית עם "מאת" (הפורמט שהגיע בפועל)', () => {
    const raw = 'תשובתי\n\nבתאריך יום ג׳, 14 ביולי 2026 ב-23:49 מאת היכל החתם סופר · גמ"ח <g@chasamsofer.info>:\n\n> ההודעה המקורית'
    expect(stripQuotedReply(raw)).toBe('תשובתי')
  })

  it('מסיר חתימת מובייל', () => {
    expect(stripQuotedReply('תודה רבה\n\nSent from my iPhone')).toBe('תודה רבה')
  })

  it('לא נוגע בטקסט נקי', () => {
    expect(stripQuotedReply('סתם טקסט')).toBe('סתם טקסט')
  })
})

describe('parseScores', () => {
  it('פורמט מקף בשורה אחת', () => {
    expect(parseScores('1-8 2-9 3-7 4-10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })

  it('פורמט נקודה בשורות נפרדות', () => {
    expect(parseScores('1. 8\n2. 9\n3. 7\n4. 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })

  it('פורמט נקודתיים עם פסיקים', () => {
    expect(parseScores('1: 8, 2: 9, 3: 7, 4: 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })

  it('רק מספרים לפי הסדר', () => {
    expect(parseScores('8 9 7 10', 4).scores).toEqual({ 1: 8, 2: 9, 3: 7, 4: 10 })
  })

  it('דוחה ציון מחוץ לטווח', () => {
    expect(parseScores('1-8 2-15 3-0 4-10', 4).scores).toEqual({ 1: 8, 4: 10 })
  })

  it('דוחה מספר שאלה שלא קיים', () => {
    expect(parseScores('1-8 9-7', 4).scores).toEqual({ 1: 8 })
  })

  it('אוסף טקסט חופשי', () => {
    const r = parseScores('1-9 2-8\nהיה מצוין תודה רבה', 2)
    expect(r.scores).toEqual({ 1: 9, 2: 8 })
    expect(r.freeText).toContain('היה מצוין')
  })

  it('קלט זבל מחזיר ריק', () => {
    expect(parseScores('שלום מה נשמע', 4).scores).toEqual({})
  })

  it('לא מפרש מספר טלפון כציונים', () => {
    expect(parseScores('0501234567', 4).scores).toEqual({})
  })

  it('מתעלם מציטוט', () => {
    const raw = '1-9 2-8 3-9 4-10\n\nOn Sun, Jul 12, 2026 wrote:\n> 1-1 2-1 3-1 4-1'
    expect(parseScores(raw, 4).scores).toEqual({ 1: 9, 2: 8, 3: 9, 4: 10 })
  })
})
