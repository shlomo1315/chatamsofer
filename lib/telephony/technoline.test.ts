import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ivrApi, campaignApi, accountApi } from './interaction'
import { applyTree, webhookUrl, uploadRecording } from './tree'
import { withinCap, buyNumber } from './account'
import { placeCodeCall, localPhone } from './client'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  process.env.TECHNOLINE_MAIN_API_KEY = 'k-main'
  process.env.TECHNOLINE_MAIN_SECRET = 's-main'
  process.env.TECHNOLINE_ACCOUNT_KEY = 'acc'
})
afterEach(() => {
  fetchMock.mockReset(); vi.unstubAllGlobals()
  for (const k of ['TECHNOLINE_MAIN_API_KEY', 'TECHNOLINE_MAIN_SECRET', 'TECHNOLINE_ACCOUNT_KEY', 'TECHNOLINE_MONTHLY_CAP', 'TECHNOLINE_OUTBOUND_ENABLED']) delete process.env[k]
})
const reply = (j: unknown) => fetchMock.mockResolvedValueOnce({ status: 200, json: async () => j })

describe('בדיקת תשובה', () => {
  it('ivr: status שאינו OK הוא כשל', async () => {
    reply({ status: 'ERROR', errorCode: -99, messige: 'IP' })
    const r = await ivrApi('main', 'filesList', { extensionId: '5' })
    expect(r.ok).toBe(false)
  })
  it('campaign: OK עובר', async () => {
    reply({ status: 'OK' })
    expect((await campaignApi('main', 'campaignRun')).ok).toBe(true)
  })
  it('account: דורש ok===true, ומפתח בכותרת', async () => {
    reply({ status: 'OK' })
    expect((await accountApi('me')).ok).toBe(false)
    reply({ ok: true })
    expect((await accountApi('me')).ok).toBe(true)
    expect(fetchMock.mock.calls[1][1].headers['X-Account-Key']).toBe('acc')
  })
  it('בלי מפתח — לא קוראים לרשת', async () => {
    delete process.env.TECHNOLINE_MAIN_API_KEY
    expect((await ivrApi('main', 'filesList')).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('עץ שלוחות והקלטות', () => {
  it('כתובת ה-webhook כוללת מערכת וסוד', () => {
    expect(webhookUrl('https://x.il/', 'yerid', 'abc', 'menu')).toBe('https://x.il/api/webhooks/technoline/yerid/abc/menu')
  })
  it('בונה שלוחה לכל רשומה ושולח extensionSet', async () => {
    reply({ status: 'OK' }); reply({ status: 'OK' }); reply({ status: 'OK' }); reply({ status: 'OK' })
    const steps = await applyTree('main', '7', 'https://x.il')
    expect(steps).toHaveLength(4)
    expect(steps.every((s) => s.ok)).toBe(true)
    expect(String(fetchMock.mock.calls[0][0])).toContain('action=extensionSet')
  })
  it('שורש לא מספרי נדחה', async () => {
    expect((await applyTree('main', 'x', 'https://x.il'))[0].ok).toBe(false)
  })
  it('הקלטה גדולה מ-2MB נדחית', async () => {
    expect((await uploadRecording('main', '1', 'n', new ArrayBuffer(3 * 1024 * 1024), 'a.wav')).ok).toBe(false)
  })
})

describe('תקרה חודשית', () => {
  it('withinCap', () => {
    expect(withinCap(0, 0, 0)).toBe(false)
    expect(withinCap(100, 90, 10)).toBe(true)
    expect(withinCap(100, 95, 10)).toBe(false)
  })
  it('בלי תקרה — אין רכישה ואין קריאה', async () => {
    const r = await buyNumber({ systemId: '1', groupId: '2', number: '03' })
    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('חריגה מהתקרה חוסמת לפני number_buy', async () => {
    process.env.TECHNOLINE_MONTHLY_CAP = '100'
    reply({ ok: true, month_spent: 95, monthly_cap: 100 })
    const r = await buyNumber({ systemId: '1', groupId: '2', number: '03', price: 10 })
    expect(r.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('שיחה יוצאת מוגנת בדגל', () => {
  it('כבויה כברירת מחדל', async () => {
    expect(await placeCodeCall('main', '0501234567', '1234')).toEqual({ ok: false, notConfigured: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('פעילה: שולחת campaignRun בלי הקוד בשגיאה', async () => {
    process.env.TECHNOLINE_OUTBOUND_ENABLED = 'true'
    reply({ status: 'OK' })
    expect((await placeCodeCall('main', '050-123-4567', '1234')).ok).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).phones).toEqual(['0501234567'])
  })
  it('מספר לא תקין', () => {
    expect(localPhone('12')).toBeNull()
    expect(localPhone('+972501234567')).toBe('0501234567')
  })
})
