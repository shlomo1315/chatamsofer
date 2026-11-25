import { describe, it, expect } from 'vitest'
import { parseRecipientQuery, recipientSummary, type RecipientRow } from './gilyonotRecipients'

const fmt = (iso: string) => iso.slice(5, 16).replace('T', ' ')
const row = (o: Partial<RecipientRow> = {}): RecipientRow => ({
  email: 'a@b.co', status: 'sent', sent_at: '2026-11-25T18:02:00Z', delivered_at: null,
  opened_at: null, open_count: 0, clicked_at: null, click_count: 0, downloaded_at: null, download_count: 0,
  bounced_at: null, bounce_type: null, complained_at: null, unsubscribed_at: null, error: null, ...o,
})

describe('parseRecipientQuery', () => {
  it('מנקה את החיפוש ומקטין אותיות', () => {
    expect(parseRecipientQuery(new URLSearchParams('q= Moshe%,(x)*@Gmail ')).q).toBe('moshex@gmail')
  })
  it('מגביל את אורך החיפוש', () => {
    expect(parseRecipientQuery(new URLSearchParams(`q=${'a'.repeat(300)}`)).q).toHaveLength(100)
  })
  it('מקבל סינון "לא פתחו" ו"הורידו"', () => {
    expect(parseRecipientQuery(new URLSearchParams('f=unopened')).f).toBe('unopened')
    expect(parseRecipientQuery(new URLSearchParams('f=downloaded')).f).toBe('downloaded')
  })
  it('דוחה סינון לא מוכר', () => {
    expect(parseRecipientQuery(new URLSearchParams('f=drop')).error).toBe('סינון לא מוכר')
  })
})

describe('recipientSummary', () => {
  it('מי שלא פתח: "נשלח ב-X, לא נפתח"', () => {
    expect(recipientSummary(row(), fmt)).toEqual({ tone: 'warn', text: 'נשלח ב-11-25 18:02, לא נפתח' })
  })
  it('מי שלא פתח והסיר את עצמו', () => {
    expect(recipientSummary(row({ unsubscribed_at: '2026-11-26T09:00:00Z' }), fmt).text).toBe('נשלח ב-11-25 18:02, לא נפתח · הסיר את עצמו ב-11-26 09:00')
  })
  it('מי שפתח כמה פעמים, הוריד והקליק', () => {
    const r = row({ opened_at: '2026-11-25T19:10:00Z', open_count: 3, downloaded_at: '2026-11-25T19:11:00Z', download_count: 1, clicked_at: '2026-11-25T19:12:00Z', click_count: 2 })
    expect(recipientSummary(r, fmt)).toEqual({ tone: 'good', text: 'נפתח ב-11-25 19:10 (3 פעמים), הוריד והקליק' })
  })
  it('חזרה קבועה', () => {
    expect(recipientSummary(row({ bounced_at: '2026-11-25T18:03:00Z', bounce_type: 'Permanent' }), fmt)).toEqual({ tone: 'bad', text: 'חזר ב-11-25 18:03 (כתובת לא קיימת)' })
  })
  it('תלונת ספאם גוברת על פתיחה', () => {
    expect(recipientSummary(row({ opened_at: '2026-11-25T19:10:00Z', open_count: 1, complained_at: '2026-11-25T19:20:00Z' }), fmt).text).toBe('סימן את המייל כספאם ב-11-25 19:20')
  })
  it('שליחה שנכשלה וממתין', () => {
    expect(recipientSummary(row({ status: 'failed', sent_at: null, error: 'rate limit' }), fmt)).toEqual({ tone: 'bad', text: 'השליחה נכשלה: rate limit' })
    expect(recipientSummary(row({ status: 'pending', sent_at: null }), fmt).text).toBe('ממתין לשליחה')
  })
})
