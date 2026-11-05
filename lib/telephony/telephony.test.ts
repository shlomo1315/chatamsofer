import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/mainMenuPhone', () => ({
  getMainMenuMessages: async () => ({
    welcome: { text: 'ברוכים הבאים' }, menu: { text: 'לחגים 1, ליולדות 2, להודעות 9' },
    notice: { text: 'אין הודעות' }, invalid: { text: 'הקשה שגויה' },
  }),
}))
vi.mock('./main/holidays', () => ({ holidays: async () => ({ type: 'simpleMessage', files: [{ text: 'חגים' }] }) }))
vi.mock('./main/maternity', () => ({ maternity: async () => ({ type: 'simpleMessage', files: [{ text: 'יולדות' }] }) }))
const take = vi.fn()
vi.mock('./otpLookup', () => ({ takePendingCode: (...a: unknown[]) => take(...a) }))

import { dispatch } from './index'
import { verifyRequest, sharedSecretSystems } from './systems'
import { validateResult } from './schema'

const ENV = ['MAIN', 'YERID', 'DISTRIBUTORS']
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  process.env.TECHNOLINE_MAIN_SECRET = 'main-secret-1'
  process.env.TECHNOLINE_YERID_SECRET = 'yerid-secret-2'
  process.env.TECHNOLINE_DISTRIBUTORS_SECRET = 'dist-secret-3'
})
afterEach(() => {
  for (const e of ENV) for (const k of ['SECRET', 'NUMBER']) delete process.env[`TECHNOLINE_${e}_${k}`]
  vi.restoreAllMocks()
})

describe('הפרדה בין שלוש המערכות', () => {
  it('סוד של מערכת אחת לא עובד באחרת', () => {
    expect(verifyRequest('main', 'main-secret-1')).toBe(true)
    expect(verifyRequest('yerid', 'main-secret-1')).toBe(false)
    expect(verifyRequest('distributors', 'yerid-secret-2')).toBe(false)
    expect(verifyRequest('main', 'dist-secret-3')).toBe(false)
  })
  it('סוד חסר — נדחה (fail-closed)', () => {
    delete process.env.TECHNOLINE_YERID_SECRET
    expect(verifyRequest('yerid', '')).toBe(false)
    expect(verifyRequest('yerid', 'undefined')).toBe(false)
  })
  it('סוד משותף לשתי מערכות — שתיהן נחסמות', () => {
    process.env.TECHNOLINE_YERID_SECRET = 'main-secret-1'
    expect(sharedSecretSystems().sort()).toEqual(['main', 'yerid'])
    expect(verifyRequest('main', 'main-secret-1')).toBe(false)
    expect(verifyRequest('yerid', 'main-secret-1')).toBe(false)
  })
  it('מספר שגוי מהמרכזיה נדחה כשמוגדר מספר למערכת', () => {
    process.env.TECHNOLINE_MAIN_NUMBER = '0771111111'
    expect(verifyRequest('main', 'main-secret-1', '0772222222')).toBe(false)
    expect(verifyRequest('main', 'main-secret-1', '0771111111')).toBe(true)
    delete process.env.TECHNOLINE_MAIN_NUMBER
  })
})

describe('dispatch', () => {
  it('מערכת לא מוכרת / סוד שגוי — 404 עם JSON תקין', async () => {
    expect((await dispatch('nope', 'x', 'menu', {})).status).toBe(404)
    const r = await dispatch('main', 'wrong', 'menu', {})
    expect(r.status).toBe(404)
    expect(r.body).toEqual({ type: 'hangup' })
  })
  it('שלוחה לא מוכרת — הודעה וניתוק', async () => {
    const r = await dispatch('main', 'main-secret-1', 'zzz', {})
    expect(Array.isArray(r.body) && r.body.at(-1)).toEqual({ type: 'hangup' })
  })
  it('שגיאה במטפל — עדיין JSON תקין עם ניתוק', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    take.mockRejectedValueOnce(new Error('boom'))
    const r = await dispatch('main', 'main-secret-1', 'otp', { PBXphone: '0501234567' })
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body) && r.body.at(-1)).toEqual({ type: 'hangup' })
  })
  it('מערכות יריד ומפיצים עונות בשלד', async () => {
    const y = await dispatch('yerid', 'yerid-secret-2', 'menu', {})
    const d = await dispatch('distributors', 'dist-secret-3', 'menu', {})
    expect(y.status).toBe(200)
    expect(d.status).toBe(200)
  })
})

describe('תפריט ראשי', () => {
  const call = (params: Record<string, string>) => dispatch('main', 'main-secret-1', 'menu', params)
  it('פתיחה: ברכה ותפריט עם מקשים 1,2,9', async () => {
    const r = await call({ PBXphone: '0501234567' })
    expect(r.body).toMatchObject({ type: 'simpleMenu', name: 'menuChoice', enabledKeys: '1,2,9' })
  })
  it('מקש 9 — הודעה וניתוק', async () => {
    const r = await call({ menuChoice: '9' })
    expect(Array.isArray(r.body) && r.body.at(-1)).toEqual({ type: 'hangup' })
  })
  it('מקש 1 — מפעיל ישירות את מטפל החגים', async () => {
    expect(JSON.stringify((await call({ menuChoice: '1' })).body)).toContain('חגים')
  })
  it('מקש 2 — מפעיל ישירות את מטפל היולדות', async () => {
    expect(JSON.stringify((await call({ menuChoice: '2' })).body)).toContain('יולדות')
  })
  it('הבקשה כפי שהגיעה מטכנוליין בשיחה אמיתית (NEW, PBXnum/PBXdid) — מקבלת את התפריט', async () => {
    process.env.TECHNOLINE_MAIN_NUMBER = '0765674241'
    const r = await call({
      PBXcallId: '6fe7511a', PBXcallStatus: 'NEW', PBXcallType: '', PBXnum: '0765674241',
      PBXdid: '0765674241', PBXphone: '0527101315', PBXextensionId: '13638', PBXextensionPath: '/',
    })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ type: 'simpleMenu', name: 'menuChoice', enabledKeys: '1,2,9' })
    expect(validateResult(r.body).ok).toBe(true)
  })
  it('ERROR (פג זמן) — חוזר לתפריט', async () => {
    expect((await call({ menuChoice: 'ERROR' })).body).toMatchObject({ type: 'simpleMenu' })
  })
})

describe('OTP', () => {
  const call = () => dispatch('main', 'main-secret-1', 'otp', { PBXphone: '0501234567', PBXcallId: 'c1' })
  it('קוד ממתין — מוקרא ספרה-ספרה ואז ניתוק', async () => {
    take.mockResolvedValueOnce({ kind: 'ok', code: '123456' })
    const r = await call()
    expect(JSON.stringify(r.body)).toContain('"digits":"123456"')
    expect(Array.isArray(r.body) && r.body.at(-1)).toEqual({ type: 'hangup' })
  })
  it('אין קוד — הודעה וניתוק, בלי ספרות', async () => {
    take.mockResolvedValueOnce({ kind: 'none' })
    expect(JSON.stringify((await call()).body)).not.toContain('digits')
  })
  it('הקוד לא נרשם בלוג', async () => {
    const log = vi.spyOn(console, 'log')
    take.mockResolvedValueOnce({ kind: 'ok', code: '987654' })
    await call()
    expect(JSON.stringify(log.mock.calls)).not.toContain('987654')
  })
})

describe('שלוחות שהועברו מהמרכזיה', () => {
  it('קוויטלאך: בלי שמות שמורים מקליטים; הקלטה נשמרת', async () => {
    const { kvitelTurn } = await import('./main/kvitel')
    expect(validateResult(kvitelTurn({}, []).result).ok).toBe(true)
    const t = kvitelTurn({ PATH_kv_rec: '/x.wav' }, [])
    expect(t.action).toEqual({ kind: 'recording', path: '/x.wav' })
    expect(kvitelTurn({ kv_confirm: '1' }, [{ name: 'א' } as never]).action).toEqual({ kind: 'saved' })
  })
  it('טעינת מוקד: כרטיס רגיש ואישור לפני שיוך', async () => {
    const { centerTurn } = await import('./main/centerLoad')
    const ask = centerTurn({}, { cardNumber: null, loadedThisMonth: false }).result as { maskLog?: boolean; post?: boolean }
    expect(ask.maskLog).toBe(true); expect(ask.post).toBe(true)
    const card = '1234567812345678'
    const conf = centerTurn({ center_card: card }, { cardNumber: null, loadedThisMonth: false })
    expect(validateResult(conf.result).ok).toBe(true)
    expect(centerTurn({ center_card: card, center_confirm: '1' }, { cardNumber: null, loadedThisMonth: false }).link).toBe(card)
    expect(centerTurn({ center_go: '1' }, { cardNumber: card, loadedThisMonth: false }).load).toBe(true)
  })
  it('זיכויי יריד: סיום ללא פרטי בנק; שמירה אחרי אישור', async () => {
    const { creditTurn } = await import('./yerid/credits')
    const ctx = { name: 'ר', books: 'ספר', amountAgorot: 5000, alreadyDone: false }
    expect(creditTurn({}, ctx).action).toEqual({ kind: 'answered' })
    const full = { cr_ok: '1', PATH_cr_holder: '/h', cr_bank: '12', cr_branch: '600', cr_acct: '123456', cr_confirm: '1' }
    const r = creditTurn(full, ctx)
    expect(r.action?.kind).toBe('save')
    const ask = creditTurn({ cr_ok: '1', PATH_cr_holder: '/h' }, ctx).result as { maskLog?: boolean; post?: boolean }
    expect(ask.maskLog && ask.post).toBe(true)
  })
})
