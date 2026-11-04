import { describe, it, expect, vi, beforeEach } from 'vitest'

// בדיקות שיחה מלאות לשיחת היריד בטכנוליין: כל פנייה עוברת דרך dispatch כמו מהמרכזיה,
// ה-REQUEST מצטבר כמו בטכנוליין, והנתונים מדומים (saleData, נוסחים והגדרות) — בלי מסד ובלי נדרים.
const { data, sessions, settings, msgKeys } = vi.hoisted(() => ({
  data: {
    findBook: vi.fn(), findBookById: vi.fn(), listCategories: vi.fn(), listBooks: vi.fn(), listMyOrders: vi.fn(),
    findCity: vi.fn(), listCities: vi.fn(), volumesByBook: vi.fn(), shippingFor: vi.fn(), reserveLastItem: vi.fn(),
    pickupAvailable: vi.fn(), createOrder: vi.fn(), finalizeOrder: vi.fn(), reserveLastPreview: vi.fn(),
    saveInquiry: vi.fn(), stashRecording: vi.fn(),
  },
  sessions: new Map<string, { id: string; state: unknown; cart_token: string; order_id: string | null }>(),
  settings: {} as Record<string, string>,
  msgKeys: [] as string[],
}))
vi.mock('./saleData', async (orig) => ({
  ...(await orig<typeof import('./saleData')>()),
  ...data,
  loadSession: async (callId: string) => {
    if (!sessions.has(callId)) sessions.set(callId, { id: `s-${callId}`, state: null, cart_token: 'cart-1', order_id: null })
    return structuredClone(sessions.get(callId)!)
  },
  saveSession: async (id: string, state: unknown, orderId?: string) => {
    for (const s of sessions.values()) if (s.id === id) { s.state = structuredClone(state); if (orderId) s.order_id = orderId }
  },
  deleteSession: async (callId: string) => { sessions.delete(callId) },
}))
vi.mock('@/lib/yemotBookFairMessages', () => ({
  TECHNOLINE_YERID_MSG_KEY: 'technoline_yerid_messages',
  getBookFairMessages: async (key: string) => { msgKeys.push(key); return {} },
}))
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: () => {
      let key = ''
      const q = { select: () => q, eq: (_c: string, v: string) => { key = v; return q }, maybeSingle: async () => ({ data: key in settings ? { value: settings[key] } : null }) }
      return q
    },
  }),
}))

import { dispatch } from '../index'
import { validateResult } from '../schema'
import type { TlResponse } from '../types'

const BOOK = { id: 'b1', sku: '101', title: 'שו"ת חתם סופר', price_agorot: 5000, in_stock: true, audio_name: null }
let callN = 0
let acc: Record<string, string> = {}
const pbx = () => ({ PBXphone: '0501234567', PBXcallId: `c${callN}`, PBXdid: '0331234567' })
async function call(extra: Record<string, string> = {}) {
  acc = { ...acc, ...extra }
  const r = await dispatch('yerid', 'yerid-secret-1', 'menu', { ...pbx(), ...acc })
  expect(r.status).toBe(200)
  expect(validateResult(r.body)).toEqual({ ok: true })
  return (Array.isArray(r.body) ? r.body : [r.body]) as TlResponse[]
}
const input = (rs: TlResponse[]) => rs.find((r) => r.type === 'getDTMF' || r.type === 'record' || r.type === 'creditCard' || r.type === 'simpleMenu') as Extract<TlResponse, { name: string }> | undefined
const said = (rs: TlResponse[]) => JSON.stringify(rs)
/** עונה על שדה הקלט של התשובה הקודמת, כמו שטכנוליין מוסיף אותו ל-REQUEST. */
const answer = (rs: TlResponse[], value: string, more: Record<string, string> = {}) => {
  const name = input(rs)!.name
  return call({ [name]: value, ...Object.fromEntries(Object.entries(more).map(([k, v]) => [`${k}${name}`, v])) })
}

beforeEach(() => {
  callN++
  acc = {}
  sessions.clear()
  msgKeys.length = 0
  for (const f of Object.values(data)) f.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.TECHNOLINE_YERID_SECRET = 'yerid-secret-1'
  process.env.TECHNOLINE_MAIN_SECRET = 'main-secret-1'
  Object.assign(settings, { book_fair_open: 'true', book_fair_phone_open: 'true', book_fair_season_closed: 'false' })
  data.listCategories.mockResolvedValue(['שו"ת'])
  data.listBooks.mockResolvedValue([BOOK])
  data.findBook.mockResolvedValue(BOOK)
  data.findBookById.mockResolvedValue(BOOK)
  data.reserveLastPreview.mockResolvedValue(true)
  data.pickupAvailable.mockResolvedValue(false)
  data.listCities.mockResolvedValue([{ phone_code: 1, name: 'בני ברק' }])
  data.findCity.mockResolvedValue({ id: 'city1', name: 'בני ברק' })
  data.volumesByBook.mockResolvedValue(new Map([['b1', 1]]))
  data.shippingFor.mockResolvedValue(2000)
  data.stashRecording.mockResolvedValue('רחוב סופר 5')
  data.createOrder.mockResolvedValue({ id: 'o1', order_number: '1234' })
  data.listMyOrders.mockResolvedValue([])
})

/** הזמנה של 2 עותקים במשלוח לבני ברק, עד מודול הסליקה. */
async function toPayment() {
  let r = await call()
  for (const v of ['1', '1', '101', '1', '2', '2', '1']) r = await answer(r, v)
  expect(input(r)!.type).toBe('record')
  r = await answer(r, '/rec/addr.wav', { FILEID_: 'f-addr', TEXT_: 'רחוב סופר 5' })
  r = await answer(r, '1') // הכתובת נכונה
  expect(input(r)!.type).toBe('record')
  r = await answer(r, '/rec/name.wav', { FILEID_: 'f-name', TEXT_: 'משה כהן' })
  r = await answer(r, '1') // השם נכון
  return answer(r, '1') // אישור הסכום
}

describe('יריד בטכנוליין: הזמנה מלאה', () => {
  it('מגיעה לסליקה בכרטיס עם הסכום והמסוף של היריד, ומסיימת הזמנה', async () => {
    const r = await toPayment()
    const pay = r.find((x) => x.type === 'creditCard') as Extract<TlResponse, { type: 'creditCard' }>
    expect(pay).toMatchObject({ sum: 120, sumChangeable: 'no', terminal: '7004562', payments: 1 }) // 2×50 + 20 משלוח
    expect(data.createOrder).toHaveBeenCalledOnce()
    expect(data.stashRecording).toHaveBeenCalledWith(expect.stringMatching(/^tl:yerid:/), 'address', expect.objectContaining({ fileId: 'f-addr', text: 'רחוב סופר 5' }))
    expect(data.reserveLastItem).toHaveBeenCalledOnce()

    const done = await call({ [pay.name]: 'OK', [`CONFIRM_${pay.name}`]: 'A123' })
    expect(data.finalizeOrder).toHaveBeenCalledWith('o1', 'cart-1', 'OK', 'A123')
    expect(done.at(-1)).toEqual({ type: 'hangup' })
    expect(sessions.size).toBe(0)
  })

  it('סליקה שנכשלה מועברת כקוד השגיאה', async () => {
    const r = await toPayment()
    const pay = input(r)!
    await call({ [pay.name]: 'ERROR' })
    expect(data.finalizeOrder).toHaveBeenCalledWith('o1', 'cart-1', 'ERROR', undefined)
  })

  it('תשובה ישנה שמצטברת ב-REQUEST לא נקראת שוב', async () => {
    let r = await call()
    r = await answer(r, '1') // תפריט הזמנה
    // bf_main_q1=1 עדיין בבקשה; אם היה נקרא שוב, היינו חוזרים לתפריט ההזמנה.
    r = await answer(r, '1')
    expect(input(r)!.name).toMatch(/^bf_sku_r1_q3$/)
  })

  it('# חוזר לתפריט הראשי', async () => {
    let r = await call()
    r = await answer(r, '1')
    r = await answer(r, '#')
    expect(input(r)!.name).toMatch(/^bf_main/)
  })

  it('מק"ט שאזל מחזיר להקשת מק"ט אחר', async () => {
    data.reserveLastPreview.mockResolvedValue(false)
    let r = await call()
    for (const v of ['1', '1', '101', '1']) r = await answer(r, v)
    r = await answer(r, '2')
    expect(said(r)).toContain('אינה זמינה')
    expect(data.reserveLastItem).not.toHaveBeenCalled()
  })
})

describe('יריד בטכנוליין: פנייה, שערים ונוסחים', () => {
  it('פנייה מוקלטת נשמרת עם מזהה הקובץ והתמלול של טכנוליין', async () => {
    data.saveInquiry.mockResolvedValue(true)
    let r = await call()
    r = await answer(r, '3')
    expect(input(r)!.type).toBe('record')
    r = await answer(r, '/rec/inq.wav', { FILEID_: 'f-inq', TEXT_: 'שאלה על משלוח' })
    expect(data.saveInquiry).toHaveBeenCalledWith('0501234567', expect.objectContaining({ fileId: 'f-inq', text: 'שאלה על משלוח' }), expect.stringMatching(/^tl:yerid:/))
    expect(r.at(-1)).toEqual({ type: 'hangup' })
  })

  it('שלוחה סגורה: הודעה וניתוק', async () => {
    Object.assign(settings, { book_fair_open: 'false', book_fair_phone_open: 'false' })
    const r = await call()
    expect(r.at(-1)).toEqual({ type: 'hangup' })
    expect(input(r)).toBeUndefined()
  })

  it('הנוסחים נטענים רק מהמפתח של טכנוליין-יריד', async () => {
    await call()
    expect(new Set(msgKeys)).toEqual(new Set(['technoline_yerid_messages']))
  })

  it('הסוד של המערכת הראשית לא פותח את היריד', async () => {
    const r = await dispatch('yerid', 'main-secret-1', 'menu', pbx())
    expect(r.status).not.toBe(200)
  })
})

describe('הפרדה מימות המשיח', () => {
  it('קבצי היריד בטכנוליין לא נוגעים בקוד או בטוקן של ימות', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const dir = new URL('.', import.meta.url).pathname
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = readFileSync(dir + file, 'utf8')
      expect(src, file).not.toMatch(/from '@\/lib\/yemot(?!BookFairMessages)/)
      expect(src, file).not.toMatch(/downloadFileFromYemot|archiveInquiryRecording|listYemotFolder|yemotToken|YEMOT_/)
    }
  })
})
