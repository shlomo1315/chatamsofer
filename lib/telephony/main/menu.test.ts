import { describe, it, expect, vi, beforeEach } from 'vitest'

const find = vi.fn()
vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => ({}) }))
vi.mock('@/lib/centerMonthlyLoad', async (orig) => ({
  ...(await orig<typeof import('@/lib/centerMonthlyLoad')>()),
  findCenterByPhone: (...a: unknown[]) => find(...a),
}))
vi.mock('@/lib/mainMenuPhone', () => ({ getMainMenuMessages: async () => ({ menu: { text: 'תפריט' } }) }))
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

describe('תפריט ראשי: ניתוב מוקדים לטעינה החודשית', () => {
  it('טלפון של מוקד מורשה עובר ישר לטעינה', async () => {
    find.mockResolvedValue({ center_id: 'x' })
    expect(text(await mainMenu(ctx()))).toContain('טעינת מוקד')
    expect(find).toHaveBeenCalledWith(expect.anything(), '0501234567')
  })
  it('מתקשר רגיל מקבל את התפריט', async () => {
    find.mockResolvedValue(null)
    expect(text(await mainMenu(ctx()))).toContain('menuChoice')
  })
  it('באמצע טעינה (פרמטר של מוקד) ממשיכים בטעינה בלי לחפש שוב', async () => {
    expect(text(await mainMenu(ctx({ center_go: '1' })))).toContain('טעינת מוקד')
    expect(find).not.toHaveBeenCalled()
  })
  it('תקלה במסד: התפריט הרגיל', async () => {
    find.mockRejectedValue(new Error('db'))
    expect(text(await mainMenu(ctx()))).toContain('menuChoice')
  })
  it('אחרי בחירה בתפריט לא בודקים מוקד', async () => {
    expect(text(await mainMenu(ctx({ menuChoice: '2' })))).toContain('יולדות')
    expect(find).not.toHaveBeenCalled()
  })
})
