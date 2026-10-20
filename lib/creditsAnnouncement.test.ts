import { describe, it, expect } from 'vitest'
import { CREDITS_ANNOUNCEMENT_TEXT as T, announcementHash } from './creditsAnnouncement'

describe('הודעת הפתיחה', () => {
  it('הנוסח של שלמה מילה במילה', () => {
    expect(T.startsWith('שלום וברכה, הודעה ממערכת הזמנות הספרים שעל ידי היכל החתם סופר.')).toBe(true)
    expect(T).toContain('הזמנתכם נשלחה לכתובת שהזנתם בעת ביצוע ההזמנה.')
    expect(T).toContain('בטלפון 09-3130924 או בדוא"ל yerid@chasamsofer.info ונחזור אליכם בהקדם.')
    expect(T).toContain('עד ליום שני ט"ו בחשוון בשעה 12 בלילה, לאחמ"כ לא נוכל לתת יותר מענה.')
    expect(T.endsWith('בברכה, היכל החתם סופר')).toBe(true)
  })
  it('החותמת משתנה עם הנוסח והקול', () => {
    expect(announcementHash(T, 'a')).not.toBe(announcementHash(T, 'b'))
    expect(announcementHash(T, 'a')).not.toBe(announcementHash(T + '.', 'a'))
  })
})
