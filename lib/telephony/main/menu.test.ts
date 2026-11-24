import { describe, it, expect, vi } from 'vitest'

const msgs: Record<string, { text: string }> = {
  temp_notice: { text: 'הודעה זמנית' }, welcome: { text: 'ברוכים הבאים' },
  menu: { text: 'תפריט' }, invalid: { text: 'הקשה שגויה' },
}
vi.mock('@/lib/mainMenuPhone', () => ({ getMainMenuMessages: async () => msgs }))
vi.mock('./holidays', () => ({ holidays: async () => ({ type: 'simpleMessage', files: [{ text: 'חגים' }] }) }))
vi.mock('./maternity', () => ({ maternity: async () => ({ type: 'simpleMessage', files: [{ text: 'יולדות' }] }) }))

import { mainMenu } from './menu'

const ctx = (params: Record<string, string> = {}) => ({ system: 'main' as const, ext: 'menu', params, phone: '972501234567', callId: 'c1' })
const text = (r: unknown) => JSON.stringify(r)

describe('תפריט ראשי: בלי שיוך וטעינה למוקדים', () => {
  it('התפריט מציע רק 1,2,9', async () => {
    const r = text(await mainMenu(ctx()))
    expect(r).toContain('1,2,9')
  })
  it('מקש 3 הוא הקשה שגויה, גם ממספר של מוקד', async () => {
    const r = text(await mainMenu(ctx({ menuChoice: '3' })))
    expect(r).toContain('הקשה שגויה')
    expect(r).not.toContain('טעינת מוקד')
  })
  it('ההודעה הזמנית נשמעת בפתיחה לפני "ברוכים הבאים", ולא אחרי הקשה שגויה', async () => {
    const open = text(await mainMenu(ctx()))
    expect(open.indexOf('הודעה זמנית')).toBeGreaterThan(-1)
    expect(open.indexOf('הודעה זמנית')).toBeLessThan(open.indexOf('ברוכים הבאים'))
    expect(text(await mainMenu(ctx({ menuChoice: '5' })))).not.toContain('הודעה זמנית')
  })
  it('הודעה זמנית ריקה מדלגים עליה', async () => {
    msgs.temp_notice.text = ''
    const open = (await mainMenu(ctx())) as { files?: unknown[] }
    msgs.temp_notice.text = 'הודעה זמנית'
    expect(JSON.stringify(open)).toContain('ברוכים הבאים')
    expect(JSON.stringify(open)).not.toContain('"text":""')
  })
  it('בחירה 1 וגם 2 עובדות כרגיל', async () => {
    expect(text(await mainMenu(ctx({ menuChoice: '1' })))).toContain('חגים')
    expect(text(await mainMenu(ctx({ menuChoice: '2' })))).toContain('יולדות')
  })
})
