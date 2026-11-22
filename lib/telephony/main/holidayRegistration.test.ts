import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסלול הרישום המלא (חלוקה "בטלפון בלבד"): ת"ז → תאריך לידה → טלפון → 2 הצהרות → רישום → מוקד.
const { data, dist, rules, notify } = vi.hoisted(() => ({
  data: {
    findMemberById: vi.fn(), findRegistrantById: vi.fn(), findMembersByPhone: vi.fn(), latestDistribution: vi.fn(),
    getRecipient: vi.fn(), pickupEverStarted: vi.fn(), centerOpening: vi.fn(), getCenter: vi.fn(), getSpokenCenter: vi.fn(),
    centerCapacities: vi.fn(), openCenters: vi.fn(), saveCenterChoice: vi.fn(), loadCard: vi.fn(), clearFailedCard: vi.fn(),
  },
  dist: { getOpenDistribution: vi.fn(), registerToOpenDistribution: vi.fn() },
  rules: { getDistRules: vi.fn() },
  notify: { notifyHolidayApproved: vi.fn() },
}))
vi.mock('./holidaysData', async (orig) => ({ ...(await orig<typeof import('./holidaysData')>()), ...data }))
vi.mock('@/lib/holidayDistributions', () => dist)
vi.mock('@/lib/holidayCards', () => ({ linkHolidayCard: vi.fn() }))
vi.mock('@/lib/holidayNotify', () => notify)
vi.mock('@/lib/holidayDistRules', async (orig) => ({ ...(await orig<typeof import('@/lib/holidayDistRules')>()), ...rules }))
vi.mock('@/lib/holidayPhoneMessages', () => ({
  getHolidayMessages: async () => Object.fromEntries(Object.entries({
    main_menu: 'תפריט ראשי', reg_menu_prompt: 'לרישום ל{distribution} הקישו 5', reg_notice: 'הודעה מקדימה',
    reg_welcome: 'ברוכים הבאים', reg_ask_id: 'הקישו תעודת זהות', id_invalid: 'מספר שגוי', not_found: 'לא נמצאתם',
    not_eligible: 'אינכם זכאים', reg_deep_review: 'פנו למשרד', reg_ask_birth: 'הקישו תאריך לידה',
    reg_birth_mismatch: 'תאריך לא תואם', reg_ask_phone: 'הקישו טלפון', reg_phone_mismatch: 'טלפון לא תואם',
    identify: 'שלום {name}', reg_ask_lineage: 'הצהרת ייחוס', reg_ask_need: 'הצהרת נזקקות', reg_declined: 'הרישום לא בוצע',
    reg_success_approved: 'נרשמתם ל{distribution} וזכאים', reg_success_pending: 'נרשמתם', reg_to_centers: 'מעבר למוקד',
    reg_center_later: 'המוקד ייבחר אחר כך', center_hours_later: 'השעות יפורסמו', reg_goodbye: 'להתראות',
    center_confirm: 'לאישור {center} הקישו 1', center_success: 'נבחר {center}', center_already: 'המוקד שלכם',
    already: '{name} כבר רשומים ל{distribution}', failed: 'תקלה', closed: 'סגור', center_full: 'מלא',
  }).map(([k, text]) => [k, { text }])),
}))

import { dispatch } from '../index'
import { validateResult } from '../schema'

const ID = '123456782'
const ben = {
  id: 'b1', family_name: 'כהן', full_name: 'משה', spouse_name: null, id_number: ID, spouse_id_number: null,
  is_active: true, eligibility_status: 'approved', birth_date: '1990-03-15', spouse_birth_date: null,
  phone: '0527654321', phone2: null, spouse_phone: null,
}
const C1 = { id: 'c1', city: 'ירושלים', name: 'ירושלים', region: 'jerusalem', sort_order: 1 }
const C2 = { id: 'c2', city: 'בני ברק', name: 'בני ברק', region: 'center', sort_order: 2 }
const OPEN = { id: 'd1', name: 'חנוכה', year: 'תשפ״ז', amount_per_family: 300, registration_open: true, phone_only: true, phone_number: '076' }
const RULES = { phoneOnly: true, blockDeepReview: true, autoApprove: true, hoursPublished: false, phoneNumber: '' }

let n = 0
const call = (p: Record<string, string> = {}) =>
  dispatch('main', 'main-secret-1', 'holidays', { PBXphone: '0501234567', PBXcallId: `rc-${n}`, menu_pick: '5', ...p })
const text = (r: { body: unknown }) => JSON.stringify(r.body)
const first = (r: { body: unknown }) => (Array.isArray(r.body) ? r.body[0] : r.body)
const full = { r_id: ID, r_bd: '15031990', r_ph: '0527654321' }

beforeEach(() => {
  n++
  vi.restoreAllMocks()
  for (const g of [data, dist, rules, notify]) for (const f of Object.values(g)) f.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.TECHNOLINE_MAIN_SECRET = 'main-secret-1'
  dist.getOpenDistribution.mockResolvedValue(OPEN)
  rules.getDistRules.mockResolvedValue(RULES)
  data.findRegistrantById.mockResolvedValue(ben)
  data.getRecipient.mockResolvedValue(null)
  data.openCenters.mockResolvedValue({ centers: [C1, C2], taken: {} })
  data.centerCapacities.mockResolvedValue({})
  data.saveCenterChoice.mockResolvedValue(null)
  data.getSpokenCenter.mockResolvedValue({ city: 'ירושלים', name: 'ירושלים', address: 'רחוב א', hours: '10-12', audio_file: null })
  notify.notifyHolidayApproved.mockResolvedValue({ sent: 1 })
})

describe('רישום בטלפון בלבד', () => {
  it('תפריט השלוחה מציע מקש 5 עם שם החלוקה', async () => {
    const r = await call({ menu_pick: '' })
    expect(first(r)).toMatchObject({ type: 'simpleMenu', enabledKeys: '1,2,3,4,5' })
    expect(text(r)).toContain('לרישום לחנוכה תשפ״ז הקישו 5')
  })

  it('פנייה ראשונה: הודעה מקדימה, ברוכים הבאים ובקשת ת"ז', async () => {
    const r = await call()
    expect(first(r)).toMatchObject({ type: 'getDTMF', name: 'r_id', maskLog: true })
    expect(text(r)).toContain('הודעה מקדימה')
    expect(text(r)).toContain('ברוכים הבאים')
    expect(validateResult(r.body).ok).toBe(true)
  })

  it('אחרי ת"ז — תאריך לידה, ואחריו טלפון', async () => {
    expect(first(await call({ r_id: ID }))).toMatchObject({ name: 'r_bd' })
    expect(first(await call({ r_id: ID, r_bd: '15031990' }))).toMatchObject({ name: 'r_ph' })
  })

  it('תאריך לידה שגוי — ניסיון נוסף בשם משתנה חדש', async () => {
    const r = await call({ r_id: ID, r_bd: '01011990' })
    expect(first(r)).toMatchObject({ name: 'r_bd2' })
    expect(text(r)).toContain('תאריך לא תואם')
  })

  it('טלפון שאינו בכרטסת — ניסיון נוסף', async () => {
    const r = await call({ r_id: ID, r_bd: '15031990', r_ph: '0500000000' })
    expect(first(r)).toMatchObject({ name: 'r_ph2' })
  })

  it('בדיקה מעמיקה נחסמת כשמסומן בחלוקה', async () => {
    data.findRegistrantById.mockResolvedValue({ ...ben, eligibility_status: 'deep_review' })
    const r = await call({ r_id: ID })
    expect(text(r)).toContain('פנו למשרד')
    expect(dist.registerToOpenDistribution).not.toHaveBeenCalled()
  })

  it('שתי הצהרות לפני הרישום; סירוב מסיים בלי רישום', async () => {
    expect(first(await call(full))).toMatchObject({ name: 'r_lin' })
    expect(first(await call({ ...full, r_lin: '1' }))).toMatchObject({ name: 'r_need' })
    const r = await call({ ...full, r_lin: '1', r_need: '2' })
    expect(text(r)).toContain('הרישום לא בוצע')
    expect(dist.registerToOpenDistribution).not.toHaveBeenCalled()
  })

  it('רישום → מייל זכאות → מעבר ישיר לבחירת עיר', async () => {
    dist.registerToOpenDistribution.mockResolvedValue({ ok: true, created: true, approved: true, recipientId: 'r1' })
    data.getRecipient.mockResolvedValueOnce(null).mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'approved' })
    const r = await call({ ...full, r_lin: '1', r_need: '1' })
    expect(dist.registerToOpenDistribution).toHaveBeenCalledWith('b1', 'phone', { phone: '0527654321' })
    expect(notify.notifyHolidayApproved).toHaveBeenCalledWith(['r1'], { email: true, phone: false })
    expect(first(r)).toMatchObject({ type: 'simpleMenu', name: 'c_city', enabledKeys: '1,2' })
    expect(text(r)).toContain('וזכאים')
    expect(text(r)).toContain('לירושלים הקישו 1')
  })

  it('בחירת מוקד ושמירה — בלי ימים ושעות עד שפורסמו', async () => {
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'approved' })
    const r = await call({ ...full, c_city: '1', c_ok: '1' })
    expect(data.saveCenterChoice).toHaveBeenCalledWith('d1', 'r1', 'c1')
    expect(text(r)).toContain('השעות יפורסמו')
    expect(text(r)).not.toContain('10-12')
  })

  it('רשום שכבר בחר מוקד — שומע אישור ושם המוקד', async () => {
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: 'c1', approval_status: 'approved' })
    const r = await call(full)
    expect(text(r)).toContain('כבר רשומים')
    expect(text(r)).toContain('ירושלים')
    expect(dist.registerToOpenDistribution).not.toHaveBeenCalled()
  })
})
