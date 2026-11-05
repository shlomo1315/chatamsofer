// בדיקות שיחה מלאה לשלוחת היולדות — כל המסלולים, בלי מסד ובלי נדרים אמיתיים.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { data, ned, cancelReminders } = vi.hoisted(() => ({
  data: {
    findActiveAid: vi.fn(), isCardRegistered: vi.fn(), setCardNumber: vi.fn(), saveNedarimId: vi.fn(),
    saveLinkError: vi.fn(), markPickedUp: vi.fn(), logActivity: vi.fn(),
  },
  ned: { getNedarimCreds: vi.fn(), setMagneticCard: vi.fn(), findClientByZeout: vi.fn(), getClientCardFull: vi.fn() },
  cancelReminders: vi.fn(),
}))
vi.mock('./maternityData', () => data)
vi.mock('@/lib/nedarim', () => ned)
vi.mock('@/lib/scheduledMail', () => ({ cancelCardPickupReminders: cancelReminders }))
vi.mock('@/lib/maternityPhoneMessages', () => ({
  getMaternityMessages: async () => Object.fromEntries(Object.entries({
    identify: 'שלום משפחת {name}', welcome: 'ברוכה הבאה', ask_card: 'הקישי את מספר הכרטיס',
    card_length: 'מספר הכרטיס צריך 16 ספרות', card_readback: 'הקשת {card} לאישור 1 לתיקון 2',
    not_found: 'המספר לא נמצא', no_birth: 'אין לידה פעילה', pending_approval: 'הבקשה ממתינה לאישור',
    card_not_allocated: 'לא הוקצה כרטיס', card_already_linked: 'הכרטיס {card} כבר משויך',
    link_success: 'הכרטיס שויך במוקד {center}', not_in_nedarim: 'לא נמצאת בנדרים', system_error: 'תקלה במערכת',
  }).map(([k, text]) => [k, { text }])),
}))

import { dispatch } from '../index'
import { validateResult } from '../schema'

const CARD = '1234567812345678'
const family: Record<string, string | null> = {
  id: 'f1', full_name: 'כהן', family_name: 'כהן', spouse_name: null, id_number: '123456782', spouse_id_number: '987654321',
  phone: '0501234567', phone2: null, spouse_phone: null, nedarim_id: 'N1',
}
const aid: Record<string, string | null> = {
  id: 'a1', birth_date: '2026-10-20', six_weeks_end: null, card_number: null, status: 'active',
  card_center_id: 'c1', card_status: 'pending', card_load_status: 'loaded', card_tlush_id: null,
}
const active = (over: Partial<typeof aid> = {}, fam: Partial<typeof family> = {}) =>
  ({ kind: 'active', family: { ...family, ...fam }, aid: { ...aid, ...over }, familyName: 'כהן' })

let callN = 0
const call = (p: Record<string, string> = {}, callId = `call-${callN}`) =>
  dispatch('main', 'main-secret-1', 'maternity', { PBXphone: '0501234567', PBXcallId: callId, ...p })
const text = (r: { body: unknown }) => JSON.stringify(r.body)
const last = (r: { body: unknown }) => (Array.isArray(r.body) ? r.body.at(-1) : r.body)

beforeEach(() => {
  callN++
  vi.restoreAllMocks()
  for (const f of [...Object.values(data), ...Object.values(ned), cancelReminders]) f.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.TECHNOLINE_MAIN_SECRET = 'main-secret-1'
  data.findActiveAid.mockResolvedValue(active())
  data.isCardRegistered.mockResolvedValue(false)
  data.markPickedUp.mockResolvedValue({ centerName: 'בני ברק', firstTime: true })
  ned.getNedarimCreds.mockResolvedValue({ mosad: 'm', apiPassword: 'p' })
  ned.setMagneticCard.mockResolvedValue({ ok: true, message: '' })
})

describe('יולדות — זיהוי', () => {
  it('לידה פעילה: שם, ברכה ובקשת כרטיס מוסתרת בלוג', async () => {
    const r = await call()
    expect(text(r)).toContain('שלום משפחת כהן')
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'card1', max: 16, maskLog: true, post: true })
    expect(validateResult(r.body).ok).toBe(true)
  })
  it('מספר לא קיים — הודעה וניתוק, ונרשם בלוג', async () => {
    data.findActiveAid.mockResolvedValue({ kind: 'notFound' })
    const r = await call()
    expect(text(r)).toContain('המספר לא נמצא')
    expect(last(r)).toEqual({ type: 'hangup' })
    expect(data.logActivity).toHaveBeenCalledWith('phone_phone_not_found', 'phone', null, expect.objectContaining({ channel: 'technoline' }))
  })
  it.each([
    [{ kind: 'noBirth', familyId: 'f1', familyName: 'כהן' }, 'אין לידה פעילה'],
    [active({ status: 'pending' }), 'הבקשה ממתינה לאישור'],
    [active({ card_load_status: null, card_tlush_id: null }), 'לא הוקצה כרטיס'],
    [active({ card_status: 'awaiting_stock' }), 'לא הוקצה כרטיס'],
    [{ kind: 'error', error: 'db' }, 'תקלה במערכת'],
  ])('%#: מסלול חסום — הודעה וניתוק', async (lookup, msg) => {
    data.findActiveAid.mockResolvedValue(lookup)
    const r = await call()
    expect(text(r)).toContain(msg)
    expect(last(r)).toEqual({ type: 'hangup' })
    expect(validateResult(r.body).ok).toBe(true)
  })
  it('כרטיס כבר משויך — מוקרא ספרה-ספרה, בלי בקשה חדשה', async () => {
    data.findActiveAid.mockResolvedValue(active({ card_number: CARD }))
    data.isCardRegistered.mockResolvedValue(true)
    const r = await call()
    expect(text(r)).toContain(`"digits":"${CARD}"`)
    expect(text(r)).not.toContain('getDTMF')
  })
  it('מספר תקוע שלא נרשם — מנוקה ומבקשים כרטיס', async () => {
    data.findActiveAid.mockResolvedValue(active({ card_number: CARD }))
    const r = await call()
    expect(data.setCardNumber).toHaveBeenCalledWith('a1', null)
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'card1' })
  })
})

describe('יולדות — הקשה ואישור', () => {
  it('אורך שגוי — הודעה וניסיון 2', async () => {
    const r = await call({ card1: '1234' })
    expect(text(r)).toContain('16 ספרות')
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'card2' })
  })
  it('אחרי 5 הקשות שגויות — ניתוק', async () => {
    const p = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`card${n}`, '12']))
    expect(last(await call(p))).toEqual({ type: 'hangup' })
  })
  it('כרטיס תקין — נשמר ומוקרא לאישור', async () => {
    const r = await call({ card1: CARD })
    expect(data.setCardNumber).toHaveBeenCalledWith('a1', CARD)
    expect(r.body).toMatchObject({ type: 'simpleMenu', name: 'ok1', enabledKeys: '1,2' })
    expect(text(r)).toContain(`"digits":"${CARD}"`)
  })
  it('תיקון (2) — מנוקה וניסיון 2 בלי ערך ישן', async () => {
    const r = await call({ card1: CARD, ok1: '2' })
    expect(data.setCardNumber).toHaveBeenCalledWith('a1', null)
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'card2' })
  })
  it('ניסיון 2 נקרא אחרי שניסיון 1 תוקן', async () => {
    const r = await call({ card1: '1111111111111111', ok1: '2', card2: CARD })
    expect(data.setCardNumber).toHaveBeenCalledWith('a1', CARD)
    expect(r.body).toMatchObject({ name: 'ok2' })
  })
  it('פג זמן באישור — ניתוק', async () => {
    expect(last(await call({ card1: CARD, ok1: 'ERROR' }))).toEqual({ type: 'hangup' })
    expect(ned.setMagneticCard).not.toHaveBeenCalled()
  })
  it('מספר הכרטיס המלא לא נרשם בלוג', async () => {
    const log = vi.spyOn(console, 'log')
    await call({ card1: CARD, ok1: '1' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(CARD)
    expect(JSON.stringify(data.logActivity.mock.calls)).not.toContain(CARD)
  })
})

describe('יולדות — שיוך בנדרים', () => {
  it('הצלחה — שיוך, איסוף, ביטול תזכורות והודעה עם המוקד', async () => {
    const r = await call({ card1: CARD, ok1: '1' })
    expect(ned.setMagneticCard).toHaveBeenCalledWith(expect.anything(), 'N1', CARD, { timeoutMs: 12000 })
    expect(data.markPickedUp).toHaveBeenCalled()
    expect(data.logActivity).toHaveBeenCalledWith('phone_card_registered', 'maternity_aid', 'a1', expect.objectContaining({ card_number_last4: '5678' }))
    expect(cancelReminders).toHaveBeenCalledWith('a1')
    expect(text(r)).toContain('שויך במוקד בני ברק')
    expect(last(r)).toEqual({ type: 'hangup' })
  })
  it('פנייה כפולה מהמרכזיה — שיוך אחד בלבד', async () => {
    await call({ card1: CARD, ok1: '1' }, 'dup-1')
    await call({ card1: CARD, ok1: '1' }, 'dup-1')
    expect(ned.setMagneticCard).toHaveBeenCalledTimes(1)
  })
  it('אחרי ניתוק (HANGUP) — לא משייכים שוב', async () => {
    const r = await call({ card1: CARD, ok1: '1', PBXcallStatus: 'HANGUP' })
    expect(r.body).toEqual({ type: 'hangup' })
    expect(ned.setMagneticCard).not.toHaveBeenCalled()
  })
  it('אין מזהה נדרים — איתור לפי ת"ז ושמירה', async () => {
    data.findActiveAid.mockResolvedValue(active({}, { nedarim_id: null }))
    ned.findClientByZeout.mockResolvedValue('N9')
    await call({ card1: CARD, ok1: '1' })
    expect(data.saveNedarimId).toHaveBeenCalledWith('f1', 'N9')
    expect(ned.setMagneticCard).toHaveBeenCalledWith(expect.anything(), 'N9', CARD, expect.anything())
  })
  it('לא נמצאת בנדרים — הודעה מתאימה', async () => {
    data.findActiveAid.mockResolvedValue(active({}, { nedarim_id: null }))
    ned.findClientByZeout.mockResolvedValue(null)
    expect(text(await call({ card1: CARD, ok1: '1' }))).toContain('לא נמצאת בנדרים')
  })
  it('מזהה שמור לא מוכר — איתור מחדש וניסיון שני', async () => {
    ned.setMagneticCard.mockResolvedValueOnce({ ok: false, message: 'לקוח לא מוכר' }).mockResolvedValueOnce({ ok: true, message: '' })
    ned.findClientByZeout.mockResolvedValue('N2')
    const r = await call({ card1: CARD, ok1: '1' })
    expect(data.saveNedarimId).toHaveBeenCalledWith('f1', 'N2')
    expect(text(r)).toContain('שויך במוקד')
  })
  it('"כבר משויך" מנדרים — נחשב הצלחה', async () => {
    ned.setMagneticCard.mockResolvedValue({ ok: false, message: 'הכרטיס כבר משויך למשפחה זו' })
    expect(text(await call({ card1: CARD, ok1: '1' }))).toContain('שויך במוקד')
  })
  it('הכרטיס מופיע אצל נדרים למרות שגיאה — נחשב הצלחה', async () => {
    ned.setMagneticCard.mockResolvedValue({ ok: false, message: 'timeout' })
    ned.getClientCardFull.mockResolvedValue({ Cards: [{ MagneticCard: CARD, RemovedDate: null }] })
    expect(text(await call({ card1: CARD, ok1: '1' }))).toContain('שויך במוקד')
  })
  it('כישלון — הסיבה מוקראת, נשמרת ברשומה, ואין איסוף', async () => {
    ned.setMagneticCard.mockResolvedValue({ ok: false, message: 'כרטיס חסום' })
    ned.getClientCardFull.mockResolvedValue({ Cards: [] })
    const r = await call({ card1: CARD, ok1: '1' })
    expect(text(r)).toContain('הסיבה כרטיס חסום')
    expect(data.saveLinkError).toHaveBeenCalledWith('a1', expect.stringContaining('כרטיס חסום'))
    expect(data.markPickedUp).not.toHaveBeenCalled()
  })
  it('נדרים לא מוגדר — תקלה במערכת', async () => {
    ned.getNedarimCreds.mockResolvedValue(null)
    expect(text(await call({ card1: CARD, ok1: '1' }))).toContain('תקלה במערכת')
  })
  it('שיוך חוזר (כבר נאסף) — בלי רישום ובלי ביטול תזכורות כפול', async () => {
    data.markPickedUp.mockResolvedValue({ centerName: 'בני ברק', firstTime: false })
    await call({ card1: CARD, ok1: '1' })
    expect(cancelReminders).not.toHaveBeenCalled()
  })
})
