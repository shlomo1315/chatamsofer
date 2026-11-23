import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// 🔴 23.11: בירור לוייס חיה "לא הגיע במייל" — לא יצא בכלל ל-Resend.
// הודעה שמזכירה דורות שודרגה לקישור, ומשפחה בלי שיוך לעץ נחסמה בשקט.

const deliverMail = vi.fn()
vi.mock('./sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...a) }))
vi.mock('./publicToken', () => ({ getOrCreateReplyToken: async () => 'tok123' }))

import { sendMaternityInquiry } from './maternityInquiry'

type Ben = { email?: string | null; lineage_node_id?: string | null }

function fakeDb(ben: Ben, opts: { msgInsertError?: string } = {}) {
  const inserts: Record<string, unknown[]> = {}
  const db = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: [] }),
        maybeSingle: async () => ({
          data: {
            id: 'aid1', beneficiary_id: 'ben1',
            beneficiary: { family_name: 'וייס', full_name: 'חיה', marital_status: 'married', ...ben },
          },
        }),
        insert: async (row: unknown) => {
          ;(inserts[table] ??= []).push(row)
          if (table === 'maternity_messages' && opts.msgInsertError) return { error: { message: opts.msgInsertError } }
          return { error: null }
        },
      }
      return q
    },
  }
  return { db: db as unknown as SupabaseClient, inserts }
}

const sender = { id: 'u1', name: 'המזכירות' }

describe('sendMaternityInquiry', () => {
  beforeEach(() => {
    deliverMail.mockReset()
    deliverMail.mockResolvedValue({ ok: true, id: 'r1' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('הודעה על דורות למשפחה בלי שיוך לעץ נשלחת (בלי קישור) ולא נחסמת', async () => {
    const { db, inserts } = fakeDb({ email: 'a@b.com', lineage_node_id: null })
    const res = await sendMaternityInquiry(db, 'aid1', 'נא לתקן את סדר הדורות', sender)
    expect(res).toEqual({ ok: true, linkAttached: false })
    expect(deliverMail).toHaveBeenCalledTimes(1)
    expect(deliverMail.mock.calls[0][0]).toBe('a@b.com')
    expect(inserts.lineage_share_invites).toBeUndefined()
    expect(inserts.maternity_messages).toHaveLength(1)
  })

  it('הודעה על דורות למשפחה משויכת מצרפת קישור אוטומטית', async () => {
    const { db, inserts } = fakeDb({ email: 'a@b.com', lineage_node_id: 'n1' })
    const res = await sendMaternityInquiry(db, 'aid1', 'נא לתקן את סדר הדורות', sender)
    expect(res).toEqual({ ok: true, linkAttached: true })
    expect(inserts.lineage_share_invites).toHaveLength(1)
    expect(String(deliverMail.mock.calls[0][2])).toContain('/lineage-review/')
  })

  it('בקשה מפורשת לקישור בלי שיוך לעץ נעצרת עם הסבר ולא נשלחת', async () => {
    const { db } = fakeDb({ email: 'a@b.com', lineage_node_id: null })
    const res = await sendMaternityInquiry(db, 'aid1', 'שלום', sender, 'lineage')
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('שיוך לעץ')
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('בלי כתובת מייל — שגיאה ברורה, בלי שליחה', async () => {
    const { db } = fakeDb({ email: ' ', lineage_node_id: 'n1' })
    const res = await sendMaternityInquiry(db, 'aid1', 'שלום', sender)
    expect(res).toEqual({ ok: false, error: 'למשפחה אין כתובת מייל רשומה' })
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('כשל ב-Resend מוחזר עם הפירוט, נרשם ביומן, ולא נרשם בשרשור', async () => {
    deliverMail.mockResolvedValue({ ok: false, error: 'domain not verified' })
    const { db, inserts } = fakeDb({ email: 'a@b.com', lineage_node_id: 'n1' })
    const res = await sendMaternityInquiry(db, 'aid1', 'שלום', sender)
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('domain not verified')
    expect(console.error).toHaveBeenCalled()
    expect(inserts.maternity_messages).toBeUndefined()
  })

  it('המייל יצא אבל הרישום בשרשור נכשל — מוחזרת אזהרה ולא נבלע', async () => {
    const { db } = fakeDb({ email: 'a@b.com', lineage_node_id: 'n1' }, { msgInsertError: 'rls' })
    const res = await sendMaternityInquiry(db, 'aid1', 'שלום', sender)
    expect(res.ok).toBe(true)
    expect(res.ok && res.warning).toContain('שמירת ההודעה בשרשור נכשלה')
    expect(console.error).toHaveBeenCalled()
  })
})
