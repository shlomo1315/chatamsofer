import { describe, it, expect, vi, beforeEach } from 'vitest'

const find = vi.fn()
vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => ({}) }))
vi.mock('@/lib/centerMonthlyLoad', async (orig) => ({
  ...(await orig<typeof import('@/lib/centerMonthlyLoad')>()),
  findCenterByPhone: (...a: unknown[]) => find(...a),
}))
vi.mock('@/lib/mainMenuPhone', () => ({ getMainMenuMessages: async () => ({ menu: { text: 'תפריט' }, centerMenu: { text: 'הודעת מוקד' } }) }))
vi.mock('./centerLoad', async (orig) => ({
  ...(await orig<typeof import('./centerLoad')>()),
  centerLoad: async () => ({ type: 'simpleMessage', files: [{ text: 'טעינת מוקד' }] }),
}))
vi.mock('./holidays', () => ({ holidays: async () => ({ type: 'simpleMessage', files: [{ text: 'חגים' }] }) }))
vi.mock('./maternity', () => ({ maternity: async () => ({ type: 'simpleMessage', files: [{ text: 'יולדות' }] }) }))

import { mainMenu } from './menu'

const ctx = (params: Record<string, string> = {}, phone = '972501234567') => ({ system: 'main' as const, ext: 'menu', params, phone, callId: 'c1' })
const text = (r: unknown) => JSON.stringify(r)

beforeEach(() => { find.mockReset(); vi.spyOn(console, 'log').mockImplementation(() => {}) })

describe('תפריט ראשי: מקש 3 למוקד מורשה', () => {
  it('מוקד מורשה שומע את הודעת המוקד ומקש 3 פעיל', async () => {
    find.mockResolvedValue({ center_id: 'x' })
    const r = text(await mainMenu(ctx()))
    expect(r).toContain('הודעת מוקד')
    expect(r).toContain('1,2,3,9')
    expect(find).toHaveBeenCalledWith(expect.anything(), '0501234567')
  })
  it('מתקשר רגיל: תפריט רגיל בלי מקש 3', async () => {
    find.mockResolvedValue(null)
    const r = text(await mainMenu(ctx()))
    expect(r).not.toContain('הודעת מוקד')
    expect(r).toContain('1,2,9')
  })
  it('מוקד שהקיש 3 עובר לטעינה', async () => {
    find.mockResolvedValue({ center_id: 'x' })
    expect(text(await mainMenu(ctx({ menuChoice: '3' })))).toContain('טעינת מוקד')
  })
  it('מי שאינו מוקד והקיש 3 מקבל הקשה שגויה ותפריט רגיל', async () => {
    find.mockResolvedValue(null)
    const r = text(await mainMenu(ctx({ menuChoice: '3' })))
    expect(r).not.toContain('טעינת מוקד')
    expect(r).toContain('1,2,9')
  })
  it('באמצע טעינה ממשיכים בלי לחפש שוב', async () => {
    expect(text(await mainMenu(ctx({ menuChoice: '3', center_go: '1' })))).toContain('טעינת מוקד')
    expect(find).not.toHaveBeenCalled()
  })
  it('תקלה במסד: התפריט הרגיל', async () => {
    find.mockRejectedValue(new Error('db'))
    expect(text(await mainMenu(ctx()))).toContain('1,2,9')
  })
  it('בחירה 2 לא בודקת מוקד', async () => {
    expect(text(await mainMenu(ctx({ menuChoice: '2' })))).toContain('יולדות')
    expect(find).not.toHaveBeenCalled()
  })
})
