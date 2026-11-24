import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// מדמה מייל נכנס ל-c@ ול-h@ ומוכיח שכל תיבה מקבלת את המענה של המחלקה שלה.
const deliver = vi.fn()
vi.mock('./sendMail', () => ({ deliverMail: (...a: unknown[]) => deliver(...a) }))

import { departmentByEmail, HOLIDAYS_DEPT_EMAIL, AID_DEPT_EMAIL } from './departments'
import { sendAutoReply } from './autoReplySender'
import { defaultAutoReplyMap, AUTO_REPLY_KEY, type AutoReplyMap } from './autoReplyConfig'

/** מסד מדומה: מחזיר את הגדרות המענה השמורות, בלי נעילה קודמת ובלי מענים השבוע. */
function fakeDb(saved: AutoReplyMap | null): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => ({
            data: table === 'app_settings' && key === AUTO_REPLY_KEY && saved ? { value: JSON.stringify(saved) } : null,
          }),
          gte: async () => ({ count: 0, error: null }),
        }),
      }),
      upsert: async () => ({ error: null }),
      insert: () => Promise.resolve({ error: null }),
    }),
  } as unknown as SupabaseClient
}

async function inbound(to: string, saved: AutoReplyMap | null) {
  const dept = departmentByEmail(to)
  const sent = await sendAutoReply(fakeDb(saved), { fromEmail: 'family@example.com', department: dept?.key })
  return { dept: dept?.key, sent }
}

describe('מייל נכנס — עזר לחגים ב-c@ וסיוע ב-h@', () => {
  beforeEach(() => { deliver.mockReset(); deliver.mockResolvedValue({ ok: true }) })

  it('הכתובות הוחלפו', () => {
    expect(HOLIDAYS_DEPT_EMAIL).toBe('c@chasamsofer.info')
    expect(AID_DEPT_EMAIL).toBe('h@chasamsofer.info')
  })

  it('מייל ל-c@ מקבל מענה של עזר לחגים, גם בלי הגדרות שמורות', async () => {
    const r = await inbound('c@chasamsofer.info', null)
    expect(r).toEqual({ dept: 'holidays', sent: true })
    const [to, subject, html, , opts] = deliver.mock.calls[0]
    expect(to).toBe('family@example.com')
    expect(subject).toBe('פנייתכם התקבלה · עזר לחגים')
    expect(html).toContain('אגף עזר לחגים')
    expect(opts.fromEmail).toBe('c@chasamsofer.info')
  })

  it('מייל ל-h@ מקבל מענה של סיוע ולא של חגים', async () => {
    const saved = defaultAutoReplyMap()
    saved.aid = { ...saved.aid!, enabled: true, mode: 'full', subject: 'פנייתכם התקבלה · מחלקת סיוע', message: 'נוסח של מחלקת סיוע' }
    const r = await inbound('h@chasamsofer.info', saved)
    expect(r).toEqual({ dept: 'aid', sent: true })
    const [, subject, html, , opts] = deliver.mock.calls[0]
    expect(subject).toBe('פנייתכם התקבלה · מחלקת סיוע')
    expect(html).toContain('נוסח של מחלקת סיוע')
    expect(html).not.toContain('עזר לחגים מיועד')
    expect(opts.fromEmail).toBe('h@chasamsofer.info')
  })

  it('הגדרה שמורה שמכבה את עזר לחגים גוברת על ברירת המחדל', async () => {
    const saved = defaultAutoReplyMap()
    saved.holidays = { ...saved.holidays!, enabled: false }
    expect(await inbound('c@chasamsofer.info', saved)).toEqual({ dept: 'holidays', sent: false })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('הכפתור במענה של האיגוד מפנה ל-c@ ולא ל-CHAGIM@', () => {
    const json = JSON.stringify(defaultAutoReplyMap().igud)
    expect(json).toContain('mailto:c@chasamsofer.info')
    expect(json).not.toMatch(/CHAGIM@/i)
  })
})
