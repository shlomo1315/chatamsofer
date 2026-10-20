import { describe, it, expect } from 'vitest'
import { CREDITS_ANNOUNCEMENT_TEXT as T, announcementHash } from './creditsAnnouncement'

describe('הודעת הפתיחה', () => {
  it('הנוסח של שלמה מילה במילה', () => {
    expect(T.startsWith('שלום וברכה, הודעה ממערכת הזמנות הספרים שעל ידי היכל החתם סופר.')).toBe(true)
    expect(T).toContain('הזמנתכם נשלחה לכתובת שהזנתם בעת ביצוע ההזמנה.')
    expect(T).toContain('בטלפון 09-3130924 או בדואר אלקטרוני yerid@chasamsofer.info ונחזור אליכם בהקדם.')
    expect(T).toContain('עד ליום שני ט"ו בחשוון בשעה 12 בלילה, לאחר מכן לא נוכל לתת יותר מענה.')
    expect(T.endsWith('בברכה, היכל החתם סופר')).toBe(true)
  })
  it('החותמת משתנה עם הנוסח והקול', () => {
    expect(announcementHash(T, 'a')).not.toBe(announcementHash(T, 'b'))
    expect(announcementHash(T, 'a')).not.toBe(announcementHash(T + '.', 'a'))
  })
})

import { spokenAnnouncementText } from './creditsAnnouncement'
describe('נוסח מוקרא', () => {
  const t = spokenAnnouncementText()
  it('טלפון ספרה אחרי ספרה', () => {
    expect(t).toContain('אפס, תשע, שלוש, אחד, שלוש, אפס, תשע, שתיים, ארבע')
    expect(t).not.toContain('3130924')
  })
  it('כתובת אות אחרי אות', () => {
    expect(t).toContain('וואי, אי, אר, איי, די, שטרודל, סי')
    expect(t).toContain('נקודה, איי, אן, אף, או')
    expect(t).not.toContain('@')
  })
  it('החלפת מילים', () => {
    expect(t).toContain('בדואר אלקטרוני')
    expect(t).toContain('לאחר מכן')
    expect(t).not.toContain('לאחמ"כ')
    expect(t).not.toContain('בדוא"ל')
  })
})

import { decideAnnouncement, parseVoiceContent } from './creditsAnnouncement'

describe('בחירת ההקלטה להשמעה', () => {
  const hash = announcementHash(spokenAnnouncementText(T), 'v')
  it('הקלטה עדכנית: משמיעים אותה ולא מפיקים מחדש (לא מוחקים קובץ באמצע שיחה)', () => {
    expect(decideAnnouncement({ hash, audio: 'rec1' }, T, 'v')).toEqual({ token: 'f-rec1', needsBuild: false })
  })
  it('נוסח שהשתנה: ממשיכים להשמיע את הקודם עד שהחדש מוכן', () => {
    expect(decideAnnouncement({ hash, audio: 'rec1' }, T + ' תוספת', 'v')).toEqual({ token: 'f-rec1', needsBuild: true })
  })
  it('אין הקלטה: אין השמעה ומפיקים', () => {
    expect(decideAnnouncement({}, T, 'v')).toEqual({ token: null, needsBuild: true })
  })
})

describe('נוסח ומספר בדיקה שמורים', () => {
  it('ריק או פגום: נוסח ברירת מחדל, ובלי מספר בדיקה', () => {
    expect(parseVoiceContent(null)).toEqual({ text: T, testPhone: '' })
    expect(parseVoiceContent('{bad')).toEqual({ text: T, testPhone: '' })
  })
  it('שומר נוסח ומנקה את המספר לספרות', () => {
    expect(parseVoiceContent(JSON.stringify({ text: ' שלום ', testPhone: '052-710-1315' }))).toEqual({ text: 'שלום', testPhone: '0527101315' })
  })
})
