import { describe, it, expect } from 'vitest'
import { toIndexRow, departmentFor, extractEmail, extractName, toIso, type IndexSource } from './gmailIndexRow'

const NOW = '2026-08-12T09:00:00.000Z'
const src = (over: Partial<IndexSource> = {}): IndexSource => ({
  id: 'm1', threadId: 't1', subject: 'שלום', from: 'ישראל <israel@example.com>',
  fromEmail: 'israel@example.com', toEmail: 'office@chasamsofer.info',
  date: 'Tue, 11 Aug 2026 12:00:00 +0300', snippet: 'תקציר', labelIds: ['INBOX', 'UNREAD'],
  attachments: [], ...over,
})

describe('extractEmail / extractName', () => {
  it('שולף כתובת מ"שם <כתובת>" ומכתובת חשופה', () => {
    expect(extractEmail('ישראל <A@Example.com>')).toBe('a@example.com')
    expect(extractEmail('a@example.com')).toBe('a@example.com')
  })

  it('ערך שאינו כתובת מוחזר null', () => {
    for (const v of ['', null, undefined, 'לא כתובת', 'a@', '@b']) {
      expect(extractEmail(v)).toBeNull()
    }
  })

  it('שם מוחזר בלי גרשיים, ובלי שם — null', () => {
    expect(extractName('"ישראל ישראלי" <a@b.com>')).toBe('ישראל ישראלי')
    expect(extractName('a@b.com')).toBeNull()
  })
})

describe('toIso', () => {
  it('ממיר תאריך תקין', () => {
    expect(toIso('Tue, 11 Aug 2026 12:00:00 +0300')).toBe('2026-08-11T09:00:00.000Z')
  })

  it('🔴 תאריך פגום מוחזר null ולא "עכשיו"', () => {
    // "עכשיו" היה מקפיץ הודעה פגומה לראש התיבה בכל סנכרון מחדש.
    for (const v of ['', null, undefined, 'לא תאריך']) expect(toIso(v)).toBeNull()
  })
})

describe('toIndexRow', () => {
  it('ממפה את השדות לתצוגה', () => {
    const row = toIndexRow(src(), NOW)
    expect(row).toMatchObject({
      gmail_message_id: 'm1', thread_id: 't1', subject: 'שלום',
      from_email: 'israel@example.com', from_name: 'ישראל',
      to_email: 'office@chasamsofer.info', has_attachments: false,
    })
    expect(row.sent_at).toBe('2026-08-11T09:00:00.000Z')
  })

  it('🔴 is_unread נגזר מתווית UNREAD — מקור האמת של Gmail', () => {
    // זו התווית שמשתנה כשקוראים בטלפון. כל גזירה אחרת הייתה מתפצלת ממה
    // שהמשתמש רואה בגמייל עצמו.
    expect(toIndexRow(src({ labelIds: ['INBOX', 'UNREAD'] }), NOW).is_unread).toBe(true)
    expect(toIndexRow(src({ labelIds: ['INBOX'] }), NOW).is_unread).toBe(false)
    expect(toIndexRow(src({ labelIds: null }), NOW).is_unread).toBe(false)
  })

  it('קבצים מצורפים מסומנים', () => {
    expect(toIndexRow(src({ attachments: [{}, {}] }), NOW).has_attachments).toBe(true)
  })

  it('שדות ריקים אינם הופכים למחרוזות ריקות', () => {
    const row = toIndexRow(src({ subject: '  ', snippet: null, threadId: '' }), NOW)
    expect(row.subject).toBeNull()
    expect(row.snippet).toBeNull()
    expect(row.thread_id).toBeNull()
  })

  it('אינו מחזיק גוף הודעה', () => {
    // ⚠️ הגוף נקרא מ-Gmail לפי דרישה. עמודה כזו הייתה הופכת את האינדקס
    // לעותק שלישי שיכול להתיישן ולסתור את Gmail.
    expect(Object.keys(toIndexRow(src(), NOW))).not.toContain('body')
  })
})

describe('🔴 departmentFor — X-Gm-Original-To קודם ל-toEmail', () => {
  const byAddress = new Map([
    ['office@chasamsofer.info', 'main'],
    ['igud@chasamsofer.info', 'igud'],
    ['halvaot@chasamsofer.info', 'loans'],
  ])

  it('מזהה לפי הכתובת שאליה נשלח במקור', () => {
    const s = src({ originalTo: 'halvaot@chasamsofer.info', toEmail: 'office@chasamsofer.info' })
    expect(departmentFor(s, byAddress)).toBe('loans')
  })

  it('🔴 בלי המקור — כל המחלקות היו נראות כאחת', () => {
    // אחרי ניתוב לתיבה משותפת, toEmail מצביע על היעד המשותף. זו הסיבה
    // שכלל הניתוב מוסיף X-Gm-Original-To מלכתחילה.
    const s = src({ originalTo: null, toEmail: 'office@chasamsofer.info' })
    expect(departmentFor(s, byAddress)).toBe('main')
  })

  it('נופל ל-toEmail כשאין כותרת מקור', () => {
    expect(departmentFor(src({ originalTo: undefined }), byAddress)).toBe('main')
  })

  it('כתובת שאינה מוכרת — null ולא ניחוש', () => {
    const s = src({ originalTo: 'stranger@elsewhere.com', toEmail: 'other@elsewhere.com' })
    expect(departmentFor(s, byAddress)).toBeNull()
  })

  it('התאמה חסרת רישיות', () => {
    expect(departmentFor(src({ originalTo: 'IGUD@ChasamSofer.info' }), byAddress)).toBe('igud')
  })
})
