import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסלול הרישום המלא (חלוקה "בטלפון בלבד"): ת"ז → תאריך לידה → טלפון → 2 הצהרות → רישום → מוקד.
const { data, dist, rules, notify } = vi.hoisted(() => ({
  data: {
    findMemberById: vi.fn(), findRegistrantById: vi.fn(), findMembersByPhone: vi.fn(), latestDistribution: vi.fn(),
    getRecipient: vi.fn(), pickupEverStarted: vi.fn(), centerOpening: vi.fn(), getCenter: vi.fn(), getSpokenCenter: vi.fn(),
    centerCapacities: vi.fn(), openCenters: vi.fn(), saveCenterChoice: vi.fn(), loadCard: vi.fn(), clearFailedCard: vi.fn(),
  },
  dist: { getOpenDistribution: vi.fn(), registerToOpenDistribution: vi.fn(), testDistributionFor: vi.fn(), getLiveDistribution: vi.fn().mockResolvedValue(null) },
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
    main_menu: 'תפריט ראשי', reg_main_menu: 'שלוחת חנוכה: רישום 1 זכאות 2 מוקד 3', reg_notice: 'הודעה מקדימה',
    reg_welcome: 'ברוכים הבאים', reg_ask_id: 'הקישו תעודת זהות', id_invalid: 'מספר שגוי', not_found: 'לא נמצאתם',
    not_eligible: 'אינכם זכאים', reg_deep_review: 'פנו למשרד', reg_ask_birth: 'הקישו תאריך לידה', reg_ask_birth_couple: 'תאריך לידה של הבעל או של האשה',
    reg_id_not_found: 'מספר זהות זה אינו מופיע במערכת. בהצלחה', reg_final_plural: 'הרשמתכם התקבלה בהצלחה במערכת',
    reg_already_received: 'הרישום שלכם כבר נקלט במערכת',
    reg_birth_mismatch: 'תאריך לא תואם', reg_ask_id_full: 'הקישו ת"ז כולל ספרת ביקורת',
    reg_to_registration: 'הינכם מועברים לרישום לחלוקה', reg_questions_notice: 'שימו לב מספר שאלות',
    reg_birth_no_match: 'אינו תואם לתאריך שמעודכן במערכת', reg_ask_phone: 'הקישו טלפון', reg_phone_mismatch: 'טלפון לא תואם',
    identify: 'שלום {name}', reg_ask_lineage: 'הצהרת ייחוס', reg_ask_need: 'הצהרת נזקקות', reg_declined: 'הרישום לא בוצע',
    reg_success_received: 'הרישום שלכם נקלט במערכת', reg_success_pending: 'נרשמתם', reg_to_centers: 'מעבר למוקד',
    reg_center_later: 'המוקד ייבחר אחר כך', center_hours_later: 'השעות יפורסמו', reg_goodbye: 'להתראות',
    center_confirm: 'לאישור {center} הקישו 1', center_success: 'נבחר {center}', center_already: 'המוקד שלכם',
    already: '{name} כבר רשומים ל{distribution}', failed: 'תקלה', closed: 'סגור', center_full: 'מלא',
    ask_id: 'הקישו ת"ז', phase_menu: 'תפריט ארבעה מקשים', elig_registered_approved: 'נרשמתם ואושרתם', elig_registered_pending: 'ממתינה לאישור', elig_can_apply: 'זכאים להגיש בקשה', elig_registration_passed: 'זמן הרישום חלף', center_yours: 'המוקד שבחרתם', center_update_later: 'עדכון מדויק יימסר', general_announcements: 'הודעה כללית לכולם', phase_not_open: 'הרישום טרם נפתח', phase_closed_wait: 'הרישום נסגר עדכון יישלח', phase_not_registered: 'לא נמצא רישום',
    phase_dist_details: 'שלום {name} זכאים ל-{amount}', phase_card_prompt: 'לשיוך כרטיס הקישו 1', pending_approval: 'ממתין', card_already: 'כרטיס כבר מחובר', center_none: 'אין מוקד',
  }).map(([k, text]) => [k, { text }])),
}))

import { dispatch } from '../index'
import { validateResult } from '../schema'

const ID = '123456782'
const ben = {
  id: 'b1', family_name: 'כהן', full_name: 'משה', spouse_name: null, id_number: ID, spouse_id_number: null,
  is_active: true, eligibility_status: 'approved', birth_date: '1990-03-15', spouse_birth_date: null, marital_status: 'רווק',
  phone: '0527654321', phone2: null, spouse_phone: null,
}
const C1 = { id: 'c1', city: 'ירושלים', name: 'ירושלים', region: 'jerusalem', sort_order: 1 }
const C2 = { id: 'c2', city: 'בני ברק', name: 'בני ברק', region: 'center', sort_order: 2 }
const OPEN = { id: 'd1', name: 'חנוכה', year: 'תשפ״ז', amount_per_family: 300, registration_open: true, phone_only: true, phone_number: '076' }
const RULES = { phoneOnly: true, blockDeepReview: true, autoApprove: true, hoursPublished: false, phoneNumber: '' }

let n = 0
const call = (p: Record<string, string> = {}) =>
  dispatch('main', 'main-secret-1', 'holidays', { PBXphone: '0501234567', PBXcallId: `rc-${n}`, menu_pick: '1', ...p })
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
  it('תפריט נקי לחנוכה: 1 רישום, 2 זכאות, 3 מוקד', async () => {
    const r = await call({ menu_pick: '' })
    expect(first(r)).toMatchObject({ type: 'simpleMenu', enabledKeys: '1,2,3' })
    expect(text(r)).toContain('שלוחת חנוכה'); expect(text(r)).not.toContain('תפריט ראשי')
  })

  it('כניסה לשלוחה: מיד בקשת ת"ז כולל ספרת ביקורת, בלי הודעות לפני', async () => {
    const r = await call()
    expect(Array.isArray(r.body)).toBe(false)
    expect(first(r)).toMatchObject({ type: 'getDTMF', name: 'r_id', maskLog: true })
    expect((first(r) as { files: unknown[] }).files).toHaveLength(1)
    expect(text(r)).toContain('כולל ספרת ביקורת')
    expect(text(r)).not.toContain('הודעה מקדימה')
    expect(text(r)).not.toContain('ברוכים הבאים')
    expect(validateResult(r.body).ok).toBe(true)
  })

  it('ת"ז עם ספרת ביקורת שגויה — "מספר שגוי" וניסיון נוסף, בלי חיפוש במערכת', async () => {
    const r = await call({ r_id: '123456789' })
    expect(first(r)).toMatchObject({ name: 'r_id2' })
    expect(text(r)).toContain('מספר שגוי')
    expect(data.findRegistrantById).not.toHaveBeenCalled()
    expect(first(await call({ r_id: '12345678' }))).toMatchObject({ name: 'r_id2' })
  })

  it('ת"ז קיימת — שתי הודעות המעבר, ואז תאריך לידה, ואחריו טלפון', async () => {
    const r = await call({ r_id: ID })
    expect(first(r)).toMatchObject({ name: 'r_bd' })
    const t = text(r)
    expect(t.indexOf('הינכם מועברים לרישום לחלוקה')).toBeGreaterThan(-1)
    expect(t.indexOf('שימו לב מספר שאלות')).toBeGreaterThan(t.indexOf('הינכם מועברים לרישום לחלוקה'))
    expect(t.indexOf('הקישו תאריך לידה')).toBeGreaterThan(t.indexOf('שימו לב מספר שאלות'))
    expect(first(await call({ r_id: ID, r_bd: '15031990' }))).toMatchObject({ name: 'r_ph' })
  })

  it('תאריך לידה שגוי — "אינו תואם לתאריך שמעודכן במערכת" ושאלה חוזרת, ואז נכון ממשיך', async () => {
    const r = await call({ r_id: ID, r_bd: '01011990' })
    expect(first(r)).toMatchObject({ name: 'r_bd2' })
    expect(text(r)).toContain('אינו תואם לתאריך שמעודכן במערכת')
    expect(text(r)).toContain('הקישו תאריך לידה')
    expect(text(r)).not.toContain('הינכם מועברים לרישום')
    expect(first(await call({ r_id: ID, r_bd: '01011990', r_bd2: '15031990' }))).toMatchObject({ name: 'r_ph' })
  })

  it('באג: תאריך שגוי ואחריו סולמית (SKIP) — הודעת אי-ההתאמה מושמעת שוב ולא נבלעת', async () => {
    const r = await call({ r_id: ID, r_bd: '01011990', r_bd2: 'SKIP' })
    expect(first(r)).toMatchObject({ name: 'r_bd3' })
    expect(text(r)).toContain('אינו תואם לתאריך שמעודכן במערכת')
    expect(first(await call({ r_id: ID, r_bd: '01011990', r_bd2: 'SKIP', r_bd3: '15031990' }))).toMatchObject({ name: 'r_ph' })
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

  it('רישום מוצלח עד הסוף: נשמר, מייל זכאות, הודעת הסיום וניתוק — בלי בחירת מוקד', async () => {
    dist.registerToOpenDistribution.mockResolvedValue({ ok: true, created: true, approved: true, recipientId: 'r1' })
    data.getRecipient.mockResolvedValueOnce(null).mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'approved' })
    const r = await call({ ...full, r_lin: '1', r_need: '1' })
    expect(dist.registerToOpenDistribution).toHaveBeenCalledWith('b1', 'phone', { phone: '0527654321', distribution: OPEN })
    expect(notify.notifyHolidayApproved).toHaveBeenCalledWith(['r1'], { email: true, phone: false })
    expect(text(r)).toContain('הרישום שלכם נקלט במערכת')
    expect(text(r)).toContain('הרשמתכם התקבלה בהצלחה במערכת')
    expect(text(r)).not.toContain('c_city')
    expect(data.openCenters).not.toHaveBeenCalled()
    expect(Array.isArray(r.body) && r.body.at(-1)).toMatchObject({ type: 'hangup' })
  })

  it('רישום שממתין לאישור — רק הודעת הסיום', async () => {
    dist.registerToOpenDistribution.mockResolvedValue({ ok: true, created: true, approved: false, recipientId: 'r1' })
    data.getRecipient.mockResolvedValueOnce(null).mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'pending' })
    const r = await call({ ...full, r_lin: '1', r_need: '1' })
    expect(text(r)).toContain('הרשמתכם התקבלה בהצלחה במערכת')
    expect(text(r)).not.toContain('הרישום שלכם נקלט')
  })

  const WIFE = '000000018'
  const couple = { ...ben, marital_status: 'נשוי', spouse_name: 'שרה', spouse_id_number: WIFE, spouse_birth_date: '1992-07-01' }
  const alreadyHeard = (r: { body: unknown }) => {
    expect(text(r)).toContain('הרישום שלכם כבר נקלט במערכת')
    expect(text(r)).not.toContain('הרשמתכם')
    expect(text(r)).not.toContain('המוקד שלכם')
    expect(text(r)).not.toContain('הקישו תאריך לידה')
    expect(dist.registerToOpenDistribution).not.toHaveBeenCalled()
    expect(Array.isArray(r.body) && r.body.at(-1)).toMatchObject({ type: 'hangup' })
  }

  it('כבר רשום, ת"ז של הבעל — מיד אחרי הת"ז "כבר התקבל" וניתוק, בלי שאלות ובלי מוקד', async () => {
    data.findRegistrantById.mockResolvedValue(couple)
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: 'c1', approval_status: 'approved' })
    alreadyHeard(await call({ r_id: ID }))
    expect(data.getRecipient).toHaveBeenCalledWith('d1', 'b1', expect.any(String))
  })

  it('כבר רשום, ת"ז של האשה — אותה כרטסת, אותה הודעה', async () => {
    data.findRegistrantById.mockResolvedValue(couple)
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'pending' })
    alreadyHeard(await call({ r_id: WIFE }))
    expect(data.findRegistrantById).toHaveBeenCalledWith(WIFE)
    expect(data.getRecipient).toHaveBeenCalledWith('d1', 'b1', expect.any(String))
  })

  it('רשום שבקשתו נדחתה — "אינכם זכאים" ולא "כבר התקבל"', async () => {
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'rejected' })
    const r = await call({ r_id: ID })
    expect(text(r)).toContain('אינכם זכאים')
    expect(text(r)).not.toContain('כבר נקלט')
  })

  it('לא נשואים: "הקישו את התאריך לידה" ורק התאריך של בעל הת"ז', async () => {
    const r = await call({ r_id: ID })
    expect(text(r)).toContain('הקישו תאריך לידה')
    expect(text(r)).not.toContain('הבעל או של האשה')
    expect(first(await call({ r_id: ID, r_bd: '15031990' }))).toMatchObject({ name: 'r_ph' })
    expect(first(await call({ r_id: ID, r_bd: '20071992' }))).toMatchObject({ name: 'r_bd2' })
  })

  it('ת"ז שלא קיימת במערכת — "אינו מופיע במערכת. בהצלחה" וניתוק, בלי ניסיון נוסף', async () => {
    data.findRegistrantById.mockResolvedValue(null)
    const r = await call({ r_id: ID })
    expect(text(r)).toContain('אינו מופיע במערכת. בהצלחה')
    expect(text(r)).not.toContain('r_id2')
    expect(Array.isArray(r.body) && r.body.at(-1)).toMatchObject({ type: 'hangup' })
  })

  it('סולמית שנשארה אחרי הת"ז (SKIP) — הודעות המעבר והתאריך שוב, בלי "אינו תואם"', async () => {
    const r = await call({ r_id: ID, r_bd: 'SKIP' })
    expect(first(r)).toMatchObject({ type: 'getDTMF', name: 'r_bd2' })
    expect(text(r)).toContain('הינכם מועברים לרישום לחלוקה')
    expect(text(r)).toContain('הקישו תאריך לידה')
    expect(text(r)).not.toContain('אינו תואם')
    expect(first(await call({ r_id: ID, r_bd: 'SKIP', r_bd2: '15031990' }))).toMatchObject({ name: 'r_ph' })
  })

  it('תאריך שגוי: 3 ניסיונות אמיתיים גם עם SKIP אחרי כל אחד, ואז הודעה וניתוק', async () => {
    const wrong = '01011990'
    const skips = { r_id: ID, r_bd: 'SKIP', r_bd2: wrong, r_bd3: 'SKIP', r_bd4: wrong, r_bd5: 'SKIP' }
    expect(first(await call(skips))).toMatchObject({ name: 'r_bd6' })
    const r = await call({ ...skips, r_bd6: wrong })
    expect(text(r)).toContain('אינו תואם לתאריך שמעודכן במערכת')
    expect(Array.isArray(r.body) && r.body.at(-1)).toMatchObject({ type: 'hangup' })
    const r3 = await call({ r_id: ID, r_bd: wrong, r_bd2: wrong, r_bd3: wrong })
    expect(text(r3)).not.toContain('r_bd4')
    expect(text(r3)).toContain('אינו תואם לתאריך שמעודכן במערכת')
    expect(Array.isArray(r3.body) && r3.body.at(-1)).toMatchObject({ type: 'hangup' })
  })

  it('רישום שנכשל — בלי הודעת "הרשמתכם התקבלה"', async () => {
    dist.registerToOpenDistribution.mockResolvedValue({ ok: false, error: 'x' })
    const r = await call({ ...full, r_lin: '1', r_need: '1' })
    expect(text(r)).toContain('תקלה')
    expect(text(r)).not.toContain('הרשמתכם התקבלה')
  })

  it('נשואים: "של הבעל או של האשה", ושני התאריכים מתקבלים', async () => {
    data.findRegistrantById.mockResolvedValue({ ...ben, marital_status: 'נשואים', spouse_birth_date: '1992-07-20' })
    expect(text(await call({ r_id: ID }))).toContain('הבעל או של האשה')
    expect(first(await call({ r_id: ID, r_bd: '15031990' }))).toMatchObject({ name: 'r_ph' })
    expect(first(await call({ r_id: ID, r_bd: '20071992' }))).toMatchObject({ name: 'r_ph' })
    expect(first(await call({ r_id: ID, r_bd: '01012000' }))).toMatchObject({ name: 'r_bd2' })
  })
})

describe('מספרי ניסיון — כשהרישום סגור', () => {
  it('מספר ניסיון מקבל את תפריט חנוכה ונרשם לחלוקה הסגורה', async () => {
    dist.getOpenDistribution.mockResolvedValue(null)
    dist.testDistributionFor.mockResolvedValue(OPEN)
    const menuR = await call({ menu_pick: '' })
    expect(first(menuR)).toMatchObject({ enabledKeys: '1,2,3' })
    dist.registerToOpenDistribution.mockResolvedValue({ ok: true, created: true, approved: true, recipientId: 'r1' })
    data.getRecipient.mockResolvedValueOnce(null).mockResolvedValue({ id: 'r1', center_id: null, approval_status: 'approved' })
    await call({ ...full, r_lin: '1', r_need: '1' })
    expect(dist.registerToOpenDistribution).toHaveBeenCalledWith('b1', 'phone', expect.objectContaining({ distribution: OPEN }))
  })

  it('מספר רגיל כשהרישום סגור — תפריט תשרי הרגיל', async () => {
    dist.getOpenDistribution.mockResolvedValue(null)
    dist.testDistributionFor.mockResolvedValue(null)
    expect(first(await call({ menu_pick: '' }))).toMatchObject({ enabledKeys: '1,2,3,4' })
  })
})

describe('הקו לפי שלב החלוקה — תפריט 4 מקשים', () => {
  const LIVE = { id: 'd1', name: 'חנוכה', year: 'תשפ״ז', amount_per_family: 300, registration_open: false, centers_open: false, status: 'active' }
  const phase = (p: string, extra: Record<string, unknown> = {}) => {
    dist.getLiveDistribution.mockResolvedValue(LIVE)
    rules.getDistRules.mockResolvedValue({ ...RULES, phase: p, testPhones: [], ...extra })
  }
  const elig = { e_id: ID, e_bd: '15031990' }

  it('תפריט קבוע 1-4 בכל שלב', async () => {
    for (const p of ['setup', 'registration', 'closed', 'distribution']) {
      phase(p)
      const r = await call({ menu_pick: '' })
      expect(first(r)).toMatchObject({ type: 'simpleMenu', enabledKeys: '1,2,3,4' })
      expect(text(r)).toContain('תפריט ארבעה מקשים')
    }
  })

  it('1 ברישום פתוח: מסלול הרישום', async () => {
    phase('registration')
    const r = await call({ menu_pick: '1' })
    expect(text(r)).toContain('כולל ספרת ביקורת'); expect(text(r)).toContain('r_id')
  })

  it('1 בהכנה: "טרם נפתח"; מספר ניסיון — מסלול הרישום', async () => {
    phase('setup')
    expect(text(await call({ menu_pick: '1' }))).toContain('טרם נפתח')
    phase('setup', { testPhones: ['0501234567'] })
    expect(text(await call({ menu_pick: '1' }))).toContain('r_id')
  })

  it('1 אחרי הסגירה: "הרישום נסגר"; בחלוקה: "זמן הרישום חלף"', async () => {
    phase('closed')
    expect(text(await call({ menu_pick: '1' }))).toContain('הרישום נסגר')
    phase('distribution')
    expect(text(await call({ menu_pick: '1' }))).toContain('זמן הרישום חלף')
  })

  it('2 זכאות: ת"ז ותאריך לידה, ואז נרשם ואושר / זמן חלף / זכאי להגיש', async () => {
    phase('closed')
    expect(text(await call({ menu_pick: '2' }))).toContain('e_id')
    expect(text(await call({ menu_pick: '2', e_id: ID }))).toContain('e_bd')
    const wrong = await call({ menu_pick: '2', e_id: ID, e_bd: '01012000' })
    expect(text(wrong)).toContain('e_bd2'); expect(text(wrong)).toContain('אינו תואם לתאריך שמעודכן במערכת')
    expect(text(await call({ menu_pick: '2', e_id: '123456789' }))).toContain('מספר שגוי')
    data.getRecipient.mockResolvedValue({ id: 'r1', approval_status: 'approved' })
    expect(text(await call({ menu_pick: '2', ...elig }))).toContain('נרשמתם ואושרתם')
    data.getRecipient.mockResolvedValue(null)
    expect(text(await call({ menu_pick: '2', ...elig }))).toContain('זמן הרישום חלף')
    phase('registration')
    expect(text(await call({ menu_pick: '2', ...elig }))).toContain('זכאים להגיש בקשה')
  })

  it('3 המוקד: שם בלבד + "עדכון יימסר" עד שהשעות פורסמו', async () => {
    phase('closed')
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: 'c1' })
    const r = await call({ menu_pick: '3', h_id: ID })
    expect(text(r)).toContain('המוקד שבחרתם'); expect(text(r)).toContain('עדכון מדויק'); expect(text(r)).not.toContain('10-12')
    phase('closed', { hoursPublished: true })
    const r2 = await call({ menu_pick: '3', h_id: ID })
    expect(text(r2)).toContain('10-12'); expect(text(r2)).not.toContain('עדכון מדויק')
  })

  it('3 כשהחלוקה פתוחה: סכום, מוקד והצעה לשיוך כרטיס', async () => {
    phase('distribution')
    data.findMemberById.mockResolvedValue(ben)
    data.latestDistribution.mockResolvedValue({ id: 'd1', amount_per_family: 300, card_expiry: null, test_mode: false, pickup_open: true })
    data.getRecipient.mockResolvedValue({ id: 'r1', center_id: 'c1', approval_status: 'approved', card_number: null })
    const r = await call({ menu_pick: '3', dst_id: ID })
    expect(text(r)).toContain('300'); expect(text(r)).toContain('רחוב א'); expect(text(r)).toContain('dst_card')
  })

  it('4 הודעות כלליות', async () => {
    phase('registration')
    expect(text(await call({ menu_pick: '4' }))).toContain('הודעה כללית לכולם')
  })
})
