import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { url: string; body: Record<string, unknown> }[] = []
let replies: Record<string, unknown>[] = []

vi.mock('../main/holidays', () => ({
  holidays: async (ctx: { params: Record<string, string> }) => ({ type: 'simpleMessage', files: [{ text: `חגים ${ctx.params.menu_pick}` }] }),
}))

import { campaignBody, campaignHanukkah, ensureList, runCampaign, AUDIO_TEXT, LIST_NAME, CAMPAIGN_EXT } from './hanukkah'

const ctx = (params: Record<string, string>) => ({ system: 'main' as const, ext: CAMPAIGN_EXT, params, phone: '0501234567', callId: 'c1' })

beforeEach(() => {
  calls.length = 0
  replies = []
  vi.stubEnv('TECHNOLINE_MAIN_SECRET', 'sec123')
  vi.stubEnv('TECHNOLINE_MAIN_API_KEY', 'key')
  vi.stubEnv('TECHNOLINE_OUTBOUND_ENABLED', 'true')
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(replies.shift() ?? { status: 'Ok' }))
  }))
})

describe('קמפיין חנוכה: גוף השליחה', () => {
  it('הקשות 1 ו-2 עוברות לשלוחה שלנו עם הסוד, ומקש 9 לא מוגדר', () => {
    const b = campaignBody('https://site.test', { listId: '77' })!
    const url = 'apiUrl-https://site.test/api/webhooks/technoline/main/sec123/campaign-hanukkah'
    expect(b['keysAction-1']).toBe(url)
    expect(b['keysAction-2']).toBe(url)
    expect(b['keysAction-9']).toBeUndefined()
    expect(b.mailingList).toBe('77')
    expect(b.phones).toBeUndefined()
  })
  it('שיחת ניסיון הולכת למספר אחד בלבד', () => {
    const b = campaignBody('https://site.test', { phone: '0501234567' })!
    expect(b.phones).toEqual(['0501234567'])
    expect(b.mailingList).toBeUndefined()
  })
  it('הנוסח להקראה: המועד הנכון, בלי תווים שטכנוליין דוחה', () => {
    expect(AUDIO_TEXT).toContain('י״ד כסליו תשפ״ז בשעה 10 בלילה')
    expect(AUDIO_TEXT).toContain('250 שקלים')
    expect(AUDIO_TEXT).not.toMatch(/[,\-"'&|=]/)
  })
  it('בלי סוד אין שליחה', () => {
    vi.stubEnv('TECHNOLINE_MAIN_SECRET', '')
    expect(campaignBody('https://site.test', { listId: '1' })).toBeNull()
  })
  it('שיחות יוצאות כבויות: לא נשלח כלום', async () => {
    vi.stubEnv('TECHNOLINE_OUTBOUND_ENABLED', '')
    const r = await runCampaign('https://site.test', { listId: '1' })
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('קמפיין חנוכה: הרשימה', () => {
  it('יוצר את הרשימה אם אינה קיימת', async () => {
    replies = [{ status: 'Ok', lists: [{ id: 5, name: 'אחרת', phonesCount: 3, blocked: 0 }] }, { status: 'Ok', id: 91, name: LIST_NAME }]
    const r = await ensureList()
    expect(r).toEqual({ ok: true, data: { id: '91', name: LIST_NAME, phonesCount: 0, blocked: 0, created: true } })
    expect(calls[1].body).toMatchObject({ action: 'mailingListEdit', name: LIST_NAME })
  })
  it('לא יוצר כפילות כשהרשימה קיימת', async () => {
    replies = [{ status: 'Ok', lists: [{ id: 91, name: LIST_NAME, phonesCount: '1,250', blocked: 2 }] }]
    const r = await ensureList()
    expect(r).toEqual({ ok: true, data: { id: '91', name: LIST_NAME, phonesCount: 1250, blocked: 2, created: false } })
    expect(calls).toHaveLength(1)
  })
})

describe('קמפיין חנוכה: ההקשות בשיחה', () => {
  it('הקשה 2 חוסמת את המספר ברשימה הזו בלבד ומנתקת', async () => {
    replies = [{ status: 'Ok', lists: [{ id: 91, name: LIST_NAME }] }, { status: 'Ok', note: 'המספר נחסם בהצלחה' }]
    const r = JSON.stringify(await campaignHanukkah(ctx({ event: 'digitPressed', digit: '2' })))
    expect(calls[1].body).toMatchObject({ action: 'setStatus', mailingList: '91', phone: '0501234567', status: 1 })
    expect(r).toContain('הוסרתם מרשימת התפוצה')
    expect(r).toContain('hangup')
  })
  it('הקשה 1 נכנסת לרישום ומסמנת את הבחירה להמשך השיחה', async () => {
    const r = await campaignHanukkah(ctx({ event: 'digitPressed', digit: '1' }))
    expect(JSON.stringify(r)).toContain('חגים 1')
    expect((r as { addParams?: Record<string, string> }).addParams).toEqual({ menu_pick: '1' })
    expect(calls).toHaveLength(0)
  })
  it('בהמשך השיחה (menu_pick כבר נשלח) ממשיך ברישום גם אם digit=2 נשאר בפרמטרים', async () => {
    const r = await campaignHanukkah(ctx({ digit: '2', menu_pick: '1', tz: '123' }))
    expect(JSON.stringify(r)).toContain('חגים 1')
    expect(calls).toHaveLength(0)
  })
})
