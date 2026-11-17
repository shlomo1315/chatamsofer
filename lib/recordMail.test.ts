import { describe, it, expect, vi } from 'vitest'
import { sendableAccounts, accountOption, buildSendBody, sendRecordMail } from './recordMail'

const draft = { to: ' a@b.co ', subject: 'שלום', html: '<p>היי</p>', attachments: [] }

describe('recordMail', () => {
  it('מסנן תיבות מושבתות וממקם את המשרד ראשון', () => {
    const list = sendableAccounts([
      { id: '1', email: 'y@x.info', department: 'maternity' },
      { id: '2', email: 'old@x.info', is_active: false },
      { id: '3', email: 'office@x.info', department: 'main' },
    ])
    expect(list.map((a) => a.id)).toEqual(['3', '1'])
  })

  it('תווית הבורר כוללת את שם המחלקה', () => {
    expect(accountOption({ id: '1', email: 'y@chasamsofer.info', department: 'maternity' }).email).toContain('עזר יולדות')
  })

  it('בונה בקשת שליחה עם התיבה שנבחרה', () => {
    const b = buildSendBody(draft, 'acc1')
    expect(b).toMatchObject({ action: 'send', to: 'a@b.co', accountId: 'acc1' })
    expect('scheduledAt' in b).toBe(false)
  })

  it('שולח למסלול הקיים ומחזיר הצלחה', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await sendRecordMail(draft, 'acc1', f as unknown as typeof fetch)
    expect(r).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/gmail/inbox/actions')
    expect(JSON.parse(init.body as string).accountId).toBe('acc1')
  })

  it('מחזיר את שגיאת השרת וגם שגיאת רשת', async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }))
    expect(await sendRecordMail(draft, undefined, bad as unknown as typeof fetch)).toEqual({ ok: false, error: 'אין הרשאה' })
    const boom = vi.fn(async () => { throw new Error('x') })
    expect(await sendRecordMail(draft, undefined, boom as unknown as typeof fetch)).toEqual({ ok: false, error: 'שגיאת רשת' })
  })
})
