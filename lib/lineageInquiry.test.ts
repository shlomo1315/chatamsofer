import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn() }))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/emailTextsStore', () => ({ ensureEmailTexts: vi.fn() }))

import { lineageInquiryTag, linkSentRecently } from './lineageInquiryTag'
import { autoSendSkipReason } from './lineageInquiry'
import { GAP_KIND_LABEL } from './deepReviewGaps'

const NOW = Date.parse('2026-11-25T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString()

describe('lineageInquiryTag', () => {
  it('אין תווית כשלא נשלח קישור', () => {
    expect(lineageInquiryTag({ eligibility_status: 'deep_review' })).toBeNull()
  })
  it('אין תווית מחוץ לבדיקה מעמיקה (מי שתיקן ועבר לממתין)', () => {
    expect(lineageInquiryTag({ eligibility_status: 'pending', lineage_link_sent_at: daysAgo(3) })).toBeNull()
  })
  it('"נשלח לבירור" כשנשלח ולא חזר', () => {
    expect(lineageInquiryTag({ eligibility_status: 'deep_review', lineage_link_sent_at: daysAgo(3) })?.kind).toBe('sent')
  })
  it('"חזר מבירור" כשהשיב אחרי הקישור', () => {
    const tag = lineageInquiryTag({ eligibility_status: 'deep_review', lineage_link_sent_at: daysAgo(3), lineage_inquiry_returned_at: daysAgo(1) })
    expect(tag).toEqual({ kind: 'returned', label: 'חזר מבירור - בדיקה מעמיקה' })
  })
  it('תשובה ישנה לפני קישור חדש לא נחשבת', () => {
    expect(lineageInquiryTag({ eligibility_status: 'deep_review', lineage_link_sent_at: daysAgo(1), lineage_inquiry_returned_at: daysAgo(5) })?.kind).toBe('sent')
  })
})

describe('linkSentRecently', () => {
  it('בתוך 30 יום', () => expect(linkSentRecently(daysAgo(29), NOW)).toBe(true))
  it('אחרי 30 יום', () => expect(linkSentRecently(daysAgo(31), NOW)).toBe(false))
  it('ריק', () => expect(linkSentRecently(null, NOW)).toBe(false))
})

describe('autoSendSkipReason', () => {
  const base = {
    eligibility_status: 'deep_review', deep_review_reason: `${Object.values(GAP_KIND_LABEL)[0]} (דור 3)`,
    lineage_node_id: 'n1', email: 'a@b.co',
  }
  it('שולח כשהשער קבע אי-התאמה ויש מייל ושיוך', () => {
    expect(autoSendSkipReason(base, NOW)).toBeNull()
  })
  it('לא שולח לסיבה שהוקלדה ידנית', () => {
    expect(autoSendSkipReason({ ...base, deep_review_reason: 'הערת מזכירות' }, NOW)).not.toBeNull()
  })
  it('לא שולח בלי שיוך לעץ או בלי מייל', () => {
    expect(autoSendSkipReason({ ...base, lineage_node_id: null }, NOW)).toBe('אין שיוך לעץ')
    expect(autoSendSkipReason({ ...base, email: 'xx' }, NOW)).toBe('אין מייל תקין')
  })
  it('לא שולח שוב כשיש קישור בתוקף', () => {
    expect(autoSendSkipReason({ ...base, lineage_link_sent_at: daysAgo(2) }, NOW)).toBe('כבר נשלח קישור בתוקף')
  })
  it('לא שולח למי שלא בבדיקה מעמיקה', () => {
    expect(autoSendSkipReason({ ...base, eligibility_status: 'pending' }, NOW)).toBe('לא בבדיקה מעמיקה')
  })
})
