import { describe, it, expect } from 'vitest'
import { applyLabelToExistingMail, type GmailAccount } from './legacyMailSync'

// mock supabase מינימלי — עוקב אחרי ה-upsert של mail_label_assignments.
function mockDb(legacyRows: { id: string }[], existingAssignments: Record<string, string[]> = {}) {
  let saved: Record<string, string[]> | null = null
  const db = {
    from(table: string) {
      if (table === 'inbound_emails') {
        return {
          select() { return this },
          eq() { return this },
          then(res: (v: unknown) => unknown) { return res({ data: legacyRows }) },
        }
      }
      // app_settings
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() { return Promise.resolve({ data: { value: JSON.stringify(existingAssignments) } }) },
        upsert(row: { value: string }) { saved = JSON.parse(row.value); return Promise.resolve({}) },
      }
    },
  }
  return { db, getSaved: () => saved }
}

const account = (labelId: string | null): GmailAccount => ({
  id: 'acc1', refresh_token: 't', department: 'maternity', label_id: labelId,
})

describe('applyLabelToExistingMail', () => {
  it('מוסיף את התווית לכל המיילים הישנים של המחלקה', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }, { id: 'm2' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(2)
    expect(getSaved()).toEqual({ m1: ['lbl-x'], m2: ['lbl-x'] })
  })

  it('לא מכפיל תווית שכבר קיימת על המייל', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }, { id: 'm2' }], { m1: ['lbl-x'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(count).toBe(1) // רק m2 נוסף
    expect(getSaved()).toEqual({ m1: ['lbl-x'], m2: ['lbl-x'] })
  })

  it('שומר תוויות אחרות שכבר על המייל', async () => {
    const { db, getSaved } = mockDb([{ id: 'm1' }], { m1: ['other'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyLabelToExistingMail(db as any, account('lbl-x'))
    expect(getSaved()).toEqual({ m1: ['other', 'lbl-x'] })
  })

  it('מחזיר 0 כשאין תווית לתיבה', async () => {
    const { db } = mockDb([{ id: 'm1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await applyLabelToExistingMail(db as any, account(null))
    expect(count).toBe(0)
  })
})
