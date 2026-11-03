import { describe, it, expect, vi, beforeEach } from 'vitest'

// בדיקות שיחה מלאות לשלוחת החגים: כל פנייה עוברת דרך dispatch כמו מהמרכזיה,
// והנתונים מדומים (holidaysData וספריות החלוקה) — בלי מסד ובלי נדרים.
const { data, dist, cards } = vi.hoisted(() => ({
  data: {
    findMemberById: vi.fn(), findMembersByPhone: vi.fn(), latestDistribution: vi.fn(), getRecipient: vi.fn(),
    pickupEverStarted: vi.fn(), centerOpening: vi.fn(), getCenter: vi.fn(), getSpokenCenter: vi.fn(),
    centerCapacities: vi.fn(), openCenters: vi.fn(), saveCenterChoice: vi.fn(), loadCard: vi.fn(), clearFailedCard: vi.fn(),
  },
  dist: { getOpenDistribution: vi.fn(), registerToOpenDistribution: vi.fn() },
  cards: { linkHolidayCard: vi.fn() },
}))
vi.mock('./holidaysData', async (orig) => ({ ...(await orig<typeof import('./holidaysData')>()), ...data }))
vi.mock('@/lib/holidayDistributions', () => dist)
vi.mock('@/lib/holidayCards', () => cards)
vi.mock('@/lib/yemotHolidayMessages', () => ({
  getHolidayMessages: async () => Object.fromEntries(Object.entries({
    main_menu: 'תפריט ראשי', ask_id: 'הקישו תעודת זהות', id_invalid: 'מספר שגוי', not_found: 'לא נמצאתם',
    closed: 'אין חלוקה פתוחה', not_eligible: 'אינכם זכאים', already: '{name} כבר רשומים ל{distribution}',
    identify: 'שלום {name}', ask_confirm: 'לאישור רישום ל{distribution} הקישו 1', cancelled: 'בוטל',
    success: '{name} נרשמתם ל{distribution}', failed: 'תקלה במערכת',
    not_registered_dist: 'אינכם רשומים לחלוקה', eligible_yes: 'אתם זכאים', eligible_pending: 'בקשתכם בבדיקה',
    card_pickup_closed: 'החלוקה טרם החלה', card_pickup_ended: 'החלוקה הסתיימה', card_phone_unknown: 'המספר אינו רשום',
    card_ask_id_multi: 'הקישו את תעודת הזהות', card_id_not_on_phone: 'הזהות אינה על המספר',
    pending_approval: 'ממתין לאישור', card_no_center: 'לא נבחר מוקד', card_center_not_open: 'המוקד טרם נפתח',
    card_already: 'כבר חובר כרטיס', card_ask: 'הקישו את מספר הכרטיס', card_invalid: 'מספר כרטיס שגוי',
    card_readback: 'הקשתם {card}, לאישור 1', card_failed: 'החיבור נכשל {reason}', card_success: 'הכרטיס חובר ונטען',
    centers_closed: 'בחירת המוקדים סגורה', center_none: 'עוד לא בחרתם מוקד', card_center_ended: 'המוקד סיים',
    card_ready: 'הכרטיס מוכן לאיסוף', center_already: 'המוקד שלכם', centers_intro: 'בחירת מוקד',
    centers_countdown: 'נותרו {left}', ask_region: 'בחרו אזור', ask_city_intro: 'בחרו עיר',
    center_confirm: 'לאישור {center} הקישו 1', center_full: 'המוקד מלא', center_success: 'נבחר {center}',
    centers_deadline_over: 'המועד עבר',
  }).map(([k, text]) => [k, { text }])),
}))

import { dispatch } from '../index'
import { validateResult } from '../schema'

const ID = '123456782'
const CARD = '1234567812345678'
const ben = {
  id: 'b1', family_name: 'כהן', full_name: 'משה', spouse_name: null, id_number: ID, spouse_id_number: null,
  is_active: true, eligibility_status: 'approved', nedarim_id_holiday: 'NH1',
}
const C1 = { id: 'c1', city: 'בני ברק', name: 'מוקד א', region: 'center', sort_order: 3 }
const C2 = { id: 'c2', city: 'ירושלים', name: 'מוקד ב', region: 'jerusalem', sort_order: 12 }
const C3 = { id: 'c3', city: 'ירושלים', name: 'מוקד ג', region: 'jerusalem', sort_order: 12 }

let callN = 0
const call = (p: Record<string, string> = {}, callId = `call-${callN}`) =>
  dispatch('main', 'main-secret-1', 'holidays', { PBXphone: '0501234567', PBXcallId: callId, ...p })
const text = (r: { body: unknown }) => JSON.stringify(r.body)
const first = (r: { body: unknown }) => (Array.isArray(r.body) ? r.body[0] : r.body)
const last = (r: { body: unknown }) => (Array.isArray(r.body) ? r.body.at(-1) : r.body)
const ends = (r: { body: unknown }, msg: string) => {
  expect(text(r)).toContain(msg)
  expect(last(r)).toEqual({ type: 'hangup' })
}

beforeEach(() => {
  callN++
  vi.restoreAllMocks()
  for (const g of [data, dist, cards]) for (const f of Object.values(g)) f.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.TECHNOLINE_MAIN_SECRET = 'main-secret-1'
  data.findMemberById.mockResolvedValue(ben)
  data.findMembersByPhone.mockResolvedValue([ben])
  data.openCenters.mockResolvedValue({ centers: [C1, C2, C3], taken: {} })
  data.centerCapacities.mockResolvedValue({})
  data.saveCenterChoice.mockResolvedValue(null)
})

describe('שלוחת החגים — תפריט', () => {
  it('כניסה: תפריט עם 4 מקשים, וכל תשובה עוברת zod', async () => {
    const r = await call()
    expect(r.body).toMatchObject({ type: 'simpleMenu', name: 'menu_pick', enabledKeys: '1,2,3,4', errorReturn: 'ERROR' })
    expect(validateResult(r.body).ok).toBe(true)
  })
  it('סוד שגוי — נדחה בלי לגעת בנתונים', async () => {
    const r = await dispatch('main', 'wrong', 'holidays', { PBXphone: '0501234567' })
    expect(r.status).not.toBe(200)
    expect(data.findMemberById).not.toHaveBeenCalled()
  })
  it('תקלה במסד — הודעת תקלה וניתוק, לא קריסה', async () => {
    data.latestDistribution.mockRejectedValue(new Error('db down'))
    const r = await call({ menu_pick: '1', elg_id: ID })
    ends(r, 'תקלה במערכת')
  })
})

describe('רישום (טיימאאוט בתפריט)', () => {
  const open = { id: 'd1', name: 'פסח', year: 2027 }
  it('אין חלוקה פתוחה', async () => {
    dist.getOpenDistribution.mockResolvedValue(null)
    ends(await call({ menu_pick: 'ERROR' }), 'אין חלוקה פתוחה')
  })
  it('בקשת ת"ז מוסתרת בלוג וב-POST', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    const r = await call({ menu_pick: 'ERROR' })
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'collect_id', max: 9, maskLog: true, post: true })
  })
  it('ת"ז קצרה — בקשה חוזרת במשתנה הבא, ואחרי 3 ניסיונות ניתוק', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    const r = await call({ menu_pick: 'ERROR', collect_id: '123' })
    expect(text(r)).toContain('מספר שגוי')
    expect(r.body).toMatchObject({ name: 'collect_id2' })
    ends(await call({ menu_pick: 'ERROR', collect_id: '1', collect_id2: '2', collect_id3: '3' }), 'מספר שגוי')
  })
  it('לא נמצא', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.findMemberById.mockResolvedValue(null)
    const r = await call({ menu_pick: 'ERROR', collect_id: ID })
    expect(r.body).toMatchObject({ name: 'collect_id2' })
    expect(text(r)).toContain('לא נמצאתם')
  })
  it('לא זכאי', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.findMemberById.mockResolvedValue({ ...ben, eligibility_status: 'rejected' })
    ends(await call({ menu_pick: 'ERROR', collect_id: ID }), 'אינכם זכאים')
  })
  it('כבר רשום', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.getRecipient.mockResolvedValue({ id: 'r1' })
    ends(await call({ menu_pick: 'ERROR', collect_id: ID }), 'כהן משה כבר רשומים לפסח 2027')
  })
  it('זיהוי ובקשת אישור, ואז רישום', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.getRecipient.mockResolvedValue(null)
    const ask = await call({ menu_pick: 'ERROR', collect_id: ID })
    expect(ask.body).toMatchObject({ type: 'simpleMenu', name: 'collect_confirm', enabledKeys: '1' })
    expect(text(ask)).toContain('שלום כהן משה')
    dist.registerToOpenDistribution.mockResolvedValue({ ok: true, created: true })
    const r = await call({ menu_pick: 'ERROR', collect_id: ID, collect_confirm: '1' })
    ends(r, 'כהן משה נרשמתם לפסח 2027')
    expect(dist.registerToOpenDistribution).toHaveBeenCalledWith('b1', 'phone', { phone: '0501234567' })
  })
  it('אישור בניסיון השני נקרא ממשתנה האישור השני', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.getRecipient.mockResolvedValue(null)
    const r = await call({ menu_pick: 'ERROR', collect_id: '1', collect_id2: ID })
    expect(r.body).toMatchObject({ name: 'collect_confirm2' })
  })
  it('לא אישר — בוטל, בלי רישום', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.getRecipient.mockResolvedValue(null)
    ends(await call({ menu_pick: 'ERROR', collect_id: ID, collect_confirm: 'ERROR' }), 'בוטל')
    expect(dist.registerToOpenDistribution).not.toHaveBeenCalled()
  })
  it('רישום נכשל', async () => {
    dist.getOpenDistribution.mockResolvedValue(open)
    data.getRecipient.mockResolvedValue(null)
    dist.registerToOpenDistribution.mockResolvedValue({ ok: false, error: 'x' })
    ends(await call({ menu_pick: 'ERROR', collect_id: ID, collect_confirm: '1' }), 'תקלה במערכת')
  })
})

describe('מקש 1: זכאות', () => {
  it('מאושר', async () => {
    data.latestDistribution.mockResolvedValue({ id: 'd1' })
    data.getRecipient.mockResolvedValue({ approval_status: 'approved' })
    ends(await call({ menu_pick: '1', elg_id: ID }), 'אתם זכאים')
  })
  it('ממתין', async () => {
    data.latestDistribution.mockResolvedValue({ id: 'd1' })
    data.getRecipient.mockResolvedValue({ approval_status: 'pending' })
    ends(await call({ menu_pick: '1', elg_id: ID }), 'בקשתכם בבדיקה')
  })
  it('לא רשום לחלוקה', async () => {
    data.latestDistribution.mockResolvedValue({ id: 'd1' })
    data.getRecipient.mockResolvedValue(null)
    ends(await call({ menu_pick: '1', elg_id: ID }), 'אינכם רשומים לחלוקה')
  })
  it('בקשת ת"ז בשם המשתנה של הזכאות', async () => {
    expect((await call({ menu_pick: '1' })).body).toMatchObject({ type: 'getDTMF', name: 'elg_id' })
  })
})

describe('מקש 3: חיבור כרטיס בנדרים', () => {
  const cd = { id: 'd1', amount_per_family: 500, card_expiry: '2027-05-01', test_mode: false, pickup_open: true }
  const rec = { id: 'r1', center_id: 'c1', approval_status: 'approved', card_number: null, load_status: 'pending' }
  const ready = () => {
    data.latestDistribution.mockResolvedValue(cd)
    data.getRecipient.mockResolvedValue(rec)
    data.centerOpening.mockResolvedValue({ pickup_open_at: '2027-04-01', pickup_ended_at: null })
  }
  const full = { menu_pick: '3', crd_num: CARD, crd_ok: '1' }

  it('איסוף סגור (טרם החל / הסתיים)', async () => {
    data.latestDistribution.mockResolvedValue({ ...cd, pickup_open: false })
    data.pickupEverStarted.mockResolvedValue(false)
    ends(await call({ menu_pick: '3' }), 'החלוקה טרם החלה')
    data.pickupEverStarted.mockResolvedValue(true)
    ends(await call({ menu_pick: '3' }), 'החלוקה הסתיימה')
  })
  it('מספר לא רשום — ניתוק בלי שום מסלול עוקף', async () => {
    ready()
    data.findMembersByPhone.mockResolvedValue([])
    ends(await call({ menu_pick: '3' }), 'המספר אינו רשום')
  })
  it('כמה משפחות על המספר — בחירה לפי ת"ז', async () => {
    ready()
    const other = { ...ben, id: 'b2', id_number: '111111118' }
    data.findMembersByPhone.mockResolvedValue([ben, other])
    expect((await call({ menu_pick: '3' })).body).toMatchObject({ type: 'getDTMF', name: 'crd_pick', maskLog: true })
    const wrong = await call({ menu_pick: '3', crd_pick: '999999999' })
    expect(wrong.body).toMatchObject({ name: 'crd_pick2' })
    expect(text(wrong)).toContain('הזהות אינה על המספר')
    const ok = await call({ menu_pick: '3', crd_pick: '111111118' })
    expect(ok.body).toMatchObject({ name: 'crd_num' })
    expect(data.getRecipient).toHaveBeenLastCalledWith('d1', 'b2', expect.any(String))
  })
  it.each([
    [null, 'לא נמצאתם'],
    [{ ...rec, approval_status: 'pending' }, 'ממתין לאישור'],
    [{ ...rec, center_id: null }, 'לא נבחר מוקד'],
    [{ ...rec, card_number: '999' }, 'כבר חובר כרטיס'],
  ])('%#: חסימה לפני בקשת כרטיס', async (r, msg) => {
    ready()
    data.getRecipient.mockResolvedValue(r)
    ends(await call({ menu_pick: '3' }), msg)
  })
  it('המוקד טרם נפתח', async () => {
    ready()
    data.centerOpening.mockResolvedValue(null)
    ends(await call({ menu_pick: '3' }), 'המוקד טרם נפתח')
  })
  it('בקשת כרטיס מוסתרת, הקראה ספרה-ספרה ואישור', async () => {
    ready()
    const ask = await call({ menu_pick: '3' })
    expect(ask.body).toMatchObject({ type: 'getDTMF', name: 'crd_num', maskLog: true, post: true })
    expect(text(ask)).toContain('שלום כהן משה')
    const rb = await call({ menu_pick: '3', crd_num: CARD })
    expect(rb.body).toMatchObject({ type: 'simpleMenu', name: 'crd_ok', enabledKeys: '1,2' })
    expect(text(rb)).toContain(`"digits":"${CARD}"`)
    expect(validateResult(rb.body).ok).toBe(true)
  })
  it('כרטיס קצר — בקשה חוזרת; הקשה 2 — הקלדה מחדש', async () => {
    ready()
    const short = await call({ menu_pick: '3', crd_num: '123' })
    expect(short.body).toMatchObject({ name: 'crd_num2' })
    expect(text(short)).toContain('מספר כרטיס שגוי')
    expect((await call({ menu_pick: '3', crd_num: CARD, crd_ok: '2' })).body).toMatchObject({ name: 'crd_num2' })
    ends(await call({ menu_pick: '3', crd_num: '1', crd_num2: '2', crd_num3: '3' }), 'מספר כרטיס שגוי')
  })
  it('שיוך וטעינה מצליחים — ובלוג רק 4 ספרות אחרונות', async () => {
    ready()
    cards.linkHolidayCard.mockResolvedValue({ ok: true })
    data.loadCard.mockResolvedValue({ outcomes: [{ ok: true }] })
    ends(await call(full), 'הכרטיס חובר ונטען')
    expect(cards.linkHolidayCard).toHaveBeenCalledWith('b1', CARD, { phone: '0501234567', distributionId: 'd1' })
    expect(data.loadCard).toHaveBeenCalledWith(
      [expect.objectContaining({ recipientId: 'r1', beneficiaryId: 'b1', nedarimIdHoliday: 'NH1' })],
      500, { expiryIso: '2027-05-01', testMode: false },
    )
    const logged = JSON.stringify((console.log as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain(CARD)
    expect(logged).toContain('****5678')
  })
  it('פנייה כפולה מהמרכזיה — שיוך וטעינה פעם אחת', async () => {
    ready()
    cards.linkHolidayCard.mockResolvedValue({ ok: true })
    data.loadCard.mockResolvedValue({ outcomes: [{ ok: true }] })
    await call(full, 'dup-call')
    await call(full, 'dup-call')
    expect(cards.linkHolidayCard).toHaveBeenCalledTimes(1)
  })
  it('כבר נטען — שיוך בלבד בלי טעינה נוספת', async () => {
    ready()
    data.getRecipient.mockResolvedValue({ ...rec, load_status: 'loaded' })
    cards.linkHolidayCard.mockResolvedValue({ ok: true })
    ends(await call(full), 'הכרטיס חובר ונטען')
    expect(data.loadCard).not.toHaveBeenCalled()
  })
  it('אין סכום לחלוקה', async () => {
    ready()
    data.latestDistribution.mockResolvedValue({ ...cd, amount_per_family: 0 })
    ends(await call(full), 'לא הוגדר סכום לחלוקה')
    expect(cards.linkHolidayCard).not.toHaveBeenCalled()
  })
  it('שיוך בנדרים נכשל', async () => {
    ready()
    cards.linkHolidayCard.mockResolvedValue({ ok: false, error: 'כרטיס לא קיים' })
    ends(await call(full), 'החיבור נכשל כרטיס לא קיים')
    expect(data.loadCard).not.toHaveBeenCalled()
  })
  it('טעינה נכשלה / חריגה — מנקים את הכרטיס לניסיון חוזר', async () => {
    ready()
    cards.linkHolidayCard.mockResolvedValue({ ok: true })
    data.loadCard.mockResolvedValue({ outcomes: [{ ok: false, error: 'יתרה' }] })
    ends(await call(full), 'החיבור נכשל יתרה')
    expect(data.clearFailedCard).toHaveBeenCalledWith('r1', 'יתרה')
    data.loadCard.mockRejectedValue(new Error('timeout'))
    ends(await call(full, 'other-call'), 'החיבור נכשל timeout')
    expect(data.clearFailedCard).toHaveBeenLastCalledWith('r1', 'timeout')
  })
})

describe('מקש 2: המוקד שנבחר', () => {
  const rec = { id: 'r1', center_id: 'c1', approval_status: 'approved', load_status: 'pending' }
  const go = () => call({ menu_pick: '2', ctr_id: ID })
  beforeEach(() => {
    data.latestDistribution.mockResolvedValue({ id: 'd1', centers_open: true, centers_deadline: null, centers_deadline_extended: null })
    data.getRecipient.mockResolvedValue(rec)
  })
  it('אין חלוקה', async () => {
    data.latestDistribution.mockResolvedValue(null)
    ends(await go(), 'בחירת המוקדים סגורה')
  })
  it('לא רשום', async () => {
    data.getRecipient.mockResolvedValue(null)
    ends(await go(), 'אינכם זכאים')
  })
  it('לא נבחר מוקד', async () => {
    data.getRecipient.mockResolvedValue({ ...rec, center_id: null })
    ends(await go(), 'עוד לא בחרתם מוקד')
  })
  it('המוקד סיים', async () => {
    data.centerOpening.mockResolvedValue({ pickup_open_at: 'x', pickup_ended_at: 'y' })
    ends(await go(), 'המוקד סיים')
  })
  it('מוקד פעיל — "מוכן לאיסוף" ופרטי המוקד', async () => {
    data.centerOpening.mockResolvedValue({ pickup_open_at: 'x', pickup_ended_at: null })
    data.getSpokenCenter.mockResolvedValue({ city: 'בני ברק', name: 'מוקד א', address: 'רבי עקיבא 1', hours: '10-14', audio_file: null })
    const r = await go()
    ends(r, 'הכרטיס מוכן לאיסוף')
    expect(text(r)).toContain('רבי עקיבא 1')
  })
  it('מוקד שטרם נפתח — שם המוקד', async () => {
    data.centerOpening.mockResolvedValue(null)
    data.getSpokenCenter.mockResolvedValue(null)
    const r = await go()
    ends(r, 'המוקד שלכם')
    expect(text(r)).toContain('מוקד א')
  })
})

describe('מקש 4: בחירת מוקד', () => {
  const rec = { id: 'r1', center_id: null, approval_status: 'approved', load_status: null, source: null, deadline_extended: false }
  const base = { menu_pick: '4', ctr_id: ID }
  beforeEach(() => {
    data.latestDistribution.mockResolvedValue({ id: 'd1', centers_open: true, centers_deadline: null, centers_deadline_extended: null })
    data.getRecipient.mockResolvedValue(rec)
  })
  it('בחירה סגורה / ממתין לאישור', async () => {
    data.latestDistribution.mockResolvedValue({ id: 'd1', centers_open: false, centers_deadline: null, centers_deadline_extended: null })
    ends(await call(base), 'בחירת המוקדים סגורה')
    data.latestDistribution.mockResolvedValue({ id: 'd1', centers_open: true, centers_deadline: null, centers_deadline_extended: null })
    data.getRecipient.mockResolvedValue({ ...rec, approval_status: 'pending' })
    ends(await call(base), 'ממתין לאישור')
  })
  it('המועד עבר', async () => {
    data.latestDistribution.mockResolvedValue({ id: 'd1', centers_open: true, centers_deadline: '2020-01-01T00:00:00Z', centers_deadline_extended: null })
    ends(await call(base), 'המועד עבר')
  })
  it('כבר נבחר מוקד', async () => {
    data.getRecipient.mockResolvedValue({ ...rec, center_id: 'c1' })
    ends(await call(base), 'המוקד שלכם')
  })
  it('בחירת עיר: מספר דו-ספרתי → הקשה חופשית עם מספרי הערים', async () => {
    const r = await call(base)
    expect(r.body).toMatchObject({ type: 'getDTMF', name: 'c_city', max: 2, min: 1 })
    expect(text(r)).toContain('לבני ברק הקישו 3')
    expect(text(r)).toContain('לירושלים הקישו 12')
    expect(validateResult(r.body).ok).toBe(true)
  })
  it('כל הערים חד-ספרתיות → תפריט מקשים', async () => {
    data.openCenters.mockResolvedValue({ centers: [C1], taken: {} })
    expect((await call(base)).body).toMatchObject({ type: 'simpleMenu', name: 'c_city', enabledKeys: '3' })
  })
  it('עיר עם כמה מוקדים → בחירת מוקד → אישור → שמירה', async () => {
    const pick = await call({ ...base, c_city: '12' })
    expect(pick.body).toMatchObject({ type: 'simpleMenu', name: 'c_center', enabledKeys: '1,2' })
    const conf = await call({ ...base, c_city: '12', c_center: '2' })
    expect(conf.body).toMatchObject({ type: 'simpleMenu', name: 'c_ok', enabledKeys: '1,2' })
    expect(text(conf)).toContain('מוקד ג')
    const r = await call({ ...base, c_city: '12', c_center: '2', c_ok: '1' })
    ends(r, 'נבחר')
    expect(data.saveCenterChoice).toHaveBeenCalledWith('d1', 'r1', 'c3')
  })
  it('עיר עם מוקד יחיד → ישר לאישור', async () => {
    expect((await call({ ...base, c_city: '3' })).body).toMatchObject({ name: 'c_ok' })
  })
  it('עיר שלא קיימת → שאלת העיר שוב', async () => {
    expect((await call({ ...base, c_city: '77' })).body).toMatchObject({ name: 'c_city' })
  })
  it('ERROR מהתפריט → בוטל, בלי לולאה', async () => {
    ends(await call({ ...base, c_city: '12', c_center: 'ERROR' }), 'בוטל')
  })
  it('לא אישר → בוטל; מוקד מלא; שמירה נכשלה', async () => {
    ends(await call({ ...base, c_city: '3', c_ok: '2' }), 'בוטל')
    data.centerCapacities.mockResolvedValue({ c1: 5 })
    data.openCenters.mockResolvedValue({ centers: [C1, C2, C3], taken: { c1: 5 } })
    ends(await call({ ...base, c_city: '3' }), 'המוקד מלא')
    data.centerCapacities.mockResolvedValue({})
    data.saveCenterChoice.mockResolvedValue('conflict')
    ends(await call({ ...base, c_city: '3', c_ok: '1' }), 'תקלה במערכת')
  })
})

describe('אין זליגה בין מערכות', () => {
  it('הסוד של main לא פותח את שלוחת החגים ב-yerid', async () => {
    process.env.TECHNOLINE_YERID_SECRET = 'yerid-secret-1'
    const r = await dispatch('yerid', 'main-secret-1', 'holidays', { PBXphone: '0501234567' })
    expect(r.status).not.toBe(200)
    const r2 = await dispatch('yerid', 'yerid-secret-1', 'holidays', { PBXphone: '0501234567' })
    expect(text(r2)).not.toContain('תפריט ראשי')
    expect(first(r2)).toBeDefined()
  })
})
