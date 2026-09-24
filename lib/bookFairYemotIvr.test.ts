import { describe, it, expect } from 'vitest'
import { nextTurn, initialState, ttsClean, type IvrState } from './bookFairYemotIvr'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מה שהמתקשר שומע — הדבר היחיד שבאמת חשוב, ושאי אפשר לראות בשום לוג
// אחרי שהוא ניתק. הפורמט כאן הוא הפרוטוקול הטקסטואלי של ימות
// (id_list_message=/read=/go_to_folder=), לא JSON כמו ב-bookFairIvr הישן.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK = { id: 'b1', sku: '1001', title: 'שולחן ערוך', price_agorot: 12000, in_stock: true }
const CITY = { id: 'c1', name: 'בני ברק' }

describe('ttsClean', () => {
  it('⚠️ מסיר נקודה ומקף — תווי המפריד בתחביר הטוקן עצמו', () => {
    expect(ttsClean('ספר — חלק א')).toBe('ספר חלק א')
    expect(ttsClean('שו"ת חתם סופר')).toBe('שו ת חתם סופר')
  })

  it('מסיר תווי כיווניות בלתי נראים', () => {
    expect(ttsClean('‏שולחן ערוך')).toBe('שולחן ערוך')
  })
})

describe('פתיחת השיחה', () => {
  it('מברכת ומבקשת מק"ט דרך read=', () => {
    const turn = nextTurn(initialState())
    expect(turn.response).toContain('read=')
    expect(turn.response).toContain('bf_sku')
    expect(turn.response).toContain('ברוכים הבאים')
    expect(turn.state.step).toBe('ask_sku')
  })
})

describe('בחירת ספר', () => {
  const afterWelcome = nextTurn(initialState()).state

  it('מקריא שם ומחיר ועובר לכמות', () => {
    const turn = nextTurn(afterWelcome, { value: '1001', book: BOOK })
    expect(turn.response).toContain('שולחן ערוך')
    expect(turn.response).toContain('n-120')
    expect(turn.state.step).toBe('ask_qty')
  })

  it('מק"ט לא קיים — מבקש שוב עם שם משתנה חדש', () => {
    const turn = nextTurn(afterWelcome, { value: '9999', book: null })
    expect(turn.response).toContain('לא נמצא')
    expect(turn.state.step).toBe('ask_sku')
    expect(turn.state.attempts).toBe(1)
  })

  it('🔴 ספר שאזל — הודעה מפורשת על הערוץ הטלפוני', () => {
    const turn = nextTurn(afterWelcome, { value: '1001', book: { ...BOOK, in_stock: false } })
    expect(turn.response).toContain('אזל')
    expect(turn.response).toContain('הטלפוני')
  })

  it('⚠️ כל ניסיון חוזר מקבל שם משתנה חדש — למניעת לולאה אינסופית בימות', () => {
    let s = afterWelcome
    const names: string[] = []
    for (let i = 0; i < 2; i++) {
      const turn = nextTurn(s, { book: null })
      // read=<טוקנים>=<שם>,<שאר האופציות> — השם הוא הפריט הראשון אחרי ה-"=" השני.
      const afterEquals = turn.response.split('=').slice(2).join('=')
      const name = afterEquals.split(',')[0]
      names.push(name)
      s = turn.state
    }
    expect(new Set(names).size).toBe(names.length)
  })

  it('⚠️ אחרי MAX_ATTEMPTS מנתקת בנימוס במקום ללולאה', () => {
    let s = afterWelcome
    let turn = nextTurn(s, { book: null })
    s = turn.state
    turn = nextTurn(s, { book: null })
    s = turn.state
    turn = nextTurn(s, { book: null })
    expect(turn.response).toContain('go_to_folder=hangup')
    expect(turn.state.step).toBe('done')
  })
})

describe('כמות ומעבר לעוד ספר', () => {
  const afterBook = nextTurn(nextTurn(initialState()).state, { value: '1001', book: BOOK }).state

  it('כמות תקינה מוסיפה לעגלה ושואלת "עוד ספר?"', () => {
    const turn = nextTurn(afterBook, { value: '2', book: BOOK, reserved: true })
    expect(turn.state.items).toHaveLength(1)
    expect(turn.state.items[0].quantity).toBe(2)
    expect(turn.state.step).toBe('ask_more')
  })

  it('🔴 שריון נכשל (אזל בזמן השיחה) — חוזר למק"ט ולא ממשיך', () => {
    const turn = nextTurn(afterBook, { value: '2', book: BOOK, reserved: false })
    expect(turn.state.step).toBe('ask_sku')
    expect(turn.response).toContain('אינה זמינה')
  })

  it('כמות לא תקינה (0, שלילי, מעל המקסימום) — מבקש שוב', () => {
    const turn = nextTurn(afterBook, { value: '0', book: BOOK })
    expect(turn.state.step).toBe('ask_qty')
  })
})

describe('משלוח או איסוף', () => {
  const withItem: IvrState = {
    step: 'ask_more', attempts: 0,
    items: [{ book_id: 'b1', sku: '1001', title: 'שולחן ערוך', price_agorot: 12000, quantity: 1 }],
  }

  it('סיום → בחירת איסוף/משלוח', () => {
    const turn = nextTurn(withItem, { value: '2' })
    expect(turn.state.step).toBe('ask_delivery')
  })

  it('איסוף עצמי מדלג ישר להקלטת שם, בלי משלוח', () => {
    const afterDelivery = nextTurn(withItem, { value: '2' }).state
    const turn = nextTurn(afterDelivery, { value: '1' })
    expect(turn.state.delivery).toBe('pickup')
    expect(turn.state.shipping_agorot).toBe(0)
    expect(turn.state.step).toBe('ask_name')
  })

  it('משלוח עובר לבחירת עיר', () => {
    const afterDelivery = nextTurn(withItem, { value: '2' }).state
    const turn = nextTurn(afterDelivery, { value: '2' })
    expect(turn.state.step).toBe('ask_city')
  })

  it('עיר לא מוכרת — מבקש שוב', () => {
    const afterDelivery = nextTurn(withItem, { value: '2' }).state
    const cityStep = nextTurn(afterDelivery, { value: '2' }).state
    const turn = nextTurn(cityStep, { value: '99', city: null })
    expect(turn.state.step).toBe('ask_city')
    expect(turn.response).toContain('אינו מוכר')
  })

  it('עיר תקינה עם תעריף → הקלטת כתובת', () => {
    const afterDelivery = nextTurn(withItem, { value: '2' }).state
    const cityStep = nextTurn(afterDelivery, { value: '2' }).state
    const turn = nextTurn(cityStep, { value: '1', city: CITY, shipping_agorot: 2500 })
    expect(turn.state.step).toBe('record_address')
    expect(turn.state.shipping_agorot).toBe(2500)
  })

  it('🔴 אין מדרגת תעריף — מפנה למשרד ומנתקת (לא חינם)', () => {
    const afterDelivery = nextTurn(withItem, { value: '2' }).state
    const cityStep = nextTurn(afterDelivery, { value: '2' }).state
    const turn = nextTurn(cityStep, { value: '1', city: CITY, shipping_agorot: null })
    expect(turn.state.step).toBe('done')
    expect(turn.response).toContain('לא ניתן לחשב')
  })
})

describe('סיכום ותשלום', () => {
  const readyForName: IvrState = {
    step: 'record_address', attempts: 0, delivery: 'shipping',
    city_id: 'c1', city_name: 'בני ברק', shipping_agorot: 2500,
    items: [{ book_id: 'b1', sku: '1001', title: 'שולחן ערוך', price_agorot: 12000, quantity: 1 }],
  }

  it('הקלטת כתובת מצליחה עוברת להקלטת שם', () => {
    const turn = nextTurn(readyForName, { recording: 'rec-1', transcript: 'רחוב הרצל 5' })
    expect(turn.state.step).toBe('ask_name')
    expect(turn.state.address_recording).toBe('rec-1')
  })

  it('הקלטת שם מצליחה מציגה סיכום עם פירוט משלוח', () => {
    const afterAddr = nextTurn(readyForName, { recording: 'rec-1' }).state
    const turn = nextTurn(afterAddr, { recording: 'rec-2' })
    expect(turn.state.step).toBe('confirm_total')
    expect(turn.response).toContain('דמי משלוח')
  })

  it('ביטול (2) בסיכום מנתק בלי לעבור לתשלום', () => {
    const afterAddr = nextTurn(readyForName, { recording: 'rec-1' }).state
    const confirmStep = nextTurn(afterAddr, { recording: 'rec-2' }).state
    const turn = nextTurn(confirmStep, { value: '2' })
    expect(turn.state.step).toBe('done')
    expect(turn.response).toContain('בוטלה')
  })

  it('🔴 אישור (1) מחזיר placeholder לסליקה — לא מטפל בכרטיס בעצמו', () => {
    const afterAddr = nextTurn(readyForName, { recording: 'rec-1' }).state
    const confirmStep = nextTurn(afterAddr, { recording: 'rec-2' }).state
    const turn = nextTurn(confirmStep, { value: '1' })
    expect(turn.state.step).toBe('payment')
    expect(turn.response).toBe('__CREDIT_CARD_PLACEHOLDER__')
  })

  it('תשלום מוצלח מקריא מספר הזמנה ספרה-ספרה', () => {
    const paymentStep: IvrState = { ...readyForName, step: 'payment' }
    const turn = nextTurn(paymentStep, { payment: 'success', order_number: 'BF26AB12' })
    expect(turn.response).toContain('d-BF26AB12')
    expect(turn.response).toContain('go_to_folder=hangup')
  })

  it('תשלום נכשל — הודעה מפורשת בלי סימון הצלחה', () => {
    const paymentStep: IvrState = { ...readyForName, step: 'payment' }
    const turn = nextTurn(paymentStep, { payment: 'failed' })
    expect(turn.response).toContain('לא אושר')
  })
})
