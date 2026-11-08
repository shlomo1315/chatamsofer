import { describe, it, expect } from 'vitest'
import { buildLoadJournal, type JournalEvent } from './cardLoadJournal'

const ev = (action: string, aid: string, at: string, details: Record<string, unknown> = {}, user: string | null = null): JournalEvent =>
  ({ action: `maternity_card_${action}`, entity_id: aid, user_id: user, details, created_at: at })

const aids = [
  { id: 'a1', name: 'כהן שרה', card_load_status: 'loaded' },
  { id: 'a2', name: 'לוי רחל', card_load_status: 'failed' },
  { id: 'a3', name: 'בדיקה מערכת', card_load_status: 'loaded' },
]
const staff = new Map([['u1', 'שלמה']])

describe('buildLoadJournal', () => {
  it('מציג טעינה עם סכום ומי הטעין — אוטומטי או משתמש', () => {
    const j = buildLoadJournal([
      ev('loaded', 'a1', '2026-08-01T10:00:00Z', { amount: 600 }),
      ev('loaded', 'a2', '2026-08-02T10:00:00Z', { amount: 600 }, 'u1'),
    ], aids, staff)
    expect(j.loaded).toBe(2)
    expect(j.rows.map(r => [r.name, r.amount, r.by])).toEqual([
      ['לוי רחל', 600, 'שלמה'],
      ['כהן שרה', 600, 'אוטומטי'],
    ])
  })

  it('מסנן טסטים: תיק שנמחק ושם עם "בדיקה"', () => {
    const j = buildLoadJournal([
      ev('loaded', 'gone', '2026-06-28T10:00:00Z', { amount: 600 }),
      ev('loaded', 'a3', '2026-07-01T10:00:00Z', { amount: 600 }),
      ev('loaded', 'a1', '2026-08-01T10:00:00Z', { amount: 600 }),
    ], aids, staff)
    expect(j.loaded).toBe(1)
    expect(j.excludedTests).toBe(2)
  })

  it('מקבץ ניסיונות כושלים רצופים לשורה אחת, ומתחיל שורה חדשה אחרי הצלחה', () => {
    const j = buildLoadJournal([
      ev('load_failed', 'a2', '2026-11-07T10:00:00Z', { error: 'עומס' }),
      ev('load_failed', 'a2', '2026-11-07T11:00:00Z', { error: 'עומס' }),
      ev('load_failed', 'a2', '2026-11-07T12:00:00Z', { error: 'הפניות נעצרו' }),
      ev('loaded', 'a2', '2026-11-07T13:00:00Z', { amount: 600 }),
      ev('load_failed', 'a2', '2026-11-08T10:00:00Z', { message: 'שגיאה' }),
    ], aids, staff)
    expect(j.rows.map(r => [r.result, r.attempts, r.error])).toEqual([
      ['failed', 1, 'שגיאה'],
      ['loaded', 1, null],
      ['failed', 3, 'הפניות נעצרו'],
    ])
    expect(j.failed).toBe(2)
    expect(j.loadedAids).toBe(1)
  })

  it('סופר תיקים שונים בנפרד מטעינות — תיק שנטען פעמיים', () => {
    const j = buildLoadJournal([
      ev('loaded', 'a1', '2026-08-03T10:00:00Z', { amount: 600 }),
      ev('loaded', 'a1', '2026-08-04T10:00:00Z', { amount: 600 }),
    ], aids, staff)
    expect(j.loaded).toBe(2)
    expect(j.loadedAids).toBe(1)
  })
})
