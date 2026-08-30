import { describe, it, expect } from 'vitest'
import { selectNameReminderTargets, MAX_NAME_REMINDERS, type ReminderRow } from './nameFixReminder'

// ─────────────────────────────────────────────────────────────────────────────
// מי מקבל תזכורת להשלמת שם התינוק.
//
// 🔴 רק תיקים שמסומן בהם "עדיין אין שם". תיק עם שם — גם אם הדגל נשאר דלוק
// בטעות — לא מקבל תזכורת: היולדת כבר עשתה את שלה, ומייל נוסף הוא הטרדה.
// ─────────────────────────────────────────────────────────────────────────────

const SUNDAY = new Date('2026-08-30T06:00:00Z')

const row = (over: Partial<ReminderRow> = {}): ReminderRow => ({
  id: 'a1',
  baby_name: null,
  baby_name_pending: true,
  babies: [{ name: null, id_number: '111' }],
  name_reminder_sent_at: null,
  name_reminder_count: 0,
  email: 'mom@example.com',
  ...over,
})

describe('selectNameReminderTargets — רק "עדיין אין שם"', () => {
  it('נשלח לתיק שסומן ואין בו שם', () => {
    expect(selectNameReminderTargets([row()], SUNDAY)).toHaveLength(1)
  })

  it('🔴 לא נשלח לתיק שהדגל כבוי', () => {
    expect(selectNameReminderTargets([row({ baby_name_pending: false })], SUNDAY)).toEqual([])
  })

  it('🔴 לא נשלח כשהדגל דלוק אך יש שם אמיתי במערך', () => {
    const withName = row({ babies: [{ name: 'שרה', id_number: '111' }] })
    expect(selectNameReminderTargets([withName], SUNDAY)).toEqual([])
  })

  it('בתאומים — נשלח כל עוד תאום אחד חסר שם', () => {
    const halfNamed = row({ babies: [{ name: 'שרה', id_number: '111' }, { name: null, id_number: '222' }] })
    expect(selectNameReminderTargets([halfNamed], SUNDAY)).toHaveLength(1)
  })

  it('בתאומים — לא נשלח כששני התאומים קיבלו שם', () => {
    const bothNamed = row({
      baby_name_pending: false,
      babies: [{ name: 'שרה', id_number: '111' }, { name: 'יעקב', id_number: '222' }],
    })
    expect(selectNameReminderTargets([bothNamed], SUNDAY)).toEqual([])
  })

  it('לא נשלח בלי כתובת מייל', () => {
    expect(selectNameReminderTargets([row({ email: null })], SUNDAY)).toEqual([])
    expect(selectNameReminderTargets([row({ email: '   ' })], SUNDAY)).toEqual([])
  })
})

describe('קצב ותקרה', () => {
  it('לא נשלח פעמיים באותו שבוע', () => {
    const justSent = row({ name_reminder_sent_at: '2026-08-28T06:00:00Z', name_reminder_count: 1 })
    expect(selectNameReminderTargets([justSent], SUNDAY)).toEqual([])
  })

  it('נשלח שוב אחרי שבוע', () => {
    const weekAgo = row({ name_reminder_sent_at: '2026-08-23T06:00:00Z', name_reminder_count: 1 })
    expect(selectNameReminderTargets([weekAgo], SUNDAY)).toHaveLength(1)
  })

  it(`עוצר אחרי ${MAX_NAME_REMINDERS} תזכורות`, () => {
    const maxed = row({ name_reminder_sent_at: '2026-08-01T06:00:00Z', name_reminder_count: MAX_NAME_REMINDERS })
    expect(selectNameReminderTargets([maxed], SUNDAY)).toEqual([])
  })

  it('התזכורת האחרונה המותרת עדיין נשלחת', () => {
    const almost = row({ name_reminder_sent_at: '2026-08-01T06:00:00Z', name_reminder_count: MAX_NAME_REMINDERS - 1 })
    expect(selectNameReminderTargets([almost], SUNDAY)).toHaveLength(1)
  })
})
