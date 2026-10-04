import { describe, it, expect } from 'vitest'
import { nextTurn, initialState, MESSAGE_FALLBACKS, ttsClean, type IvrState } from './bookFairYemotIvr'

// ─────────────────────────────────────────────────────────────────────────────
// מבנה התפריט כפי שאופיין: תפריט ראשי → הזמנה / הזמנה קיימת / פנייה,
// ובתוך ההזמנה: מק"ט / קטגוריות / כל הספרים עם דפדוף.
//
// 🔴 זה הדבר היחיד שאי אפשר לראות בשום לוג אחרי שהמתקשר ניתק.
// ─────────────────────────────────────────────────────────────────────────────

const BOOKS = [
  { id: 'b1', sku: '0101', title: 'שות חתם סופר', price_agorot: 26300, in_stock: true },
  { id: 'b2', sku: '0102', title: 'תשובות חדשות', price_agorot: 2100, in_stock: true },
  { id: 'b3', sku: '0201', title: 'דרשות חתם סופר', price_agorot: 27300, in_stock: true },
]
const CATS = ['שאלות ותשובות', 'דרוש ואגדה']

/** מריץ רצף הקשות ומחזיר את המצב והתשובה האחרונים. */
function run(steps: { value?: string; input?: Record<string, unknown> }[], from?: IvrState) {
  let state = from ?? initialState()
  let response = ''
  for (const s of steps) {
    const turn = nextTurn(state, { value: s.value, ...(s.input ?? {}) })
    state = turn.state
    response = turn.response
  }
  return { state, response }
}

describe('🔴 התפריט הראשי', () => {
  it('הברכה מובילה לתפריט ולא ישר למק"ט', () => {
    const turn = nextTurn(initialState())
    expect(turn.state.step).toBe('main_menu')
    expect(turn.response).toContain(MESSAGE_FALLBACKS.welcome)
    // ⚠️ ttsClean: גרשיים ומקפים מוסרים לפני ההקראה (כ"ה → כ ה),
    // ולכן ההשוואה היא למה שבאמת נשמע ולא למחרוזת המקור.
    expect(turn.response).toContain(ttsClean(MESSAGE_FALLBACKS.open_until))
    expect(turn.response).toContain(MESSAGE_FALLBACKS.main_menu)
  })

  it('1 → תפריט ההזמנה', () => {
    const { state, response } = run([{}, { value: '1' }])
    expect(state.step).toBe('order_menu')
    expect(response).toContain(MESSAGE_FALLBACKS.order_menu)
  })

  it('3 → הקלטת פנייה', () => {
    const { state, response } = run([{}, { value: '3' }])
    expect(state.step).toBe('record_inquiry')
    // 🔴 'record' ולא 'voice'.
    //
    // ⚠️ 'voice' נראה כמו השדרוג המתבקש אבל משנה את מה שחוזר
    // במשתנה: במקום נתיב הקובץ חוזרות ההקשות ("Digits-0"), וכל
    // הורדה מימות נכשלת. התמלול מופעל ב-ext.ini, לא כאן.
    expect(response).toContain('record')
    expect(response).not.toContain('voice')
  })

  it('הקשה שגויה חוזרת על התפריט ואינה מנתקת', () => {
    const { state, response } = run([{}, { value: '7' }])
    expect(state.step).toBe('main_menu')
    expect(response).not.toContain('hangup')
  })
})

describe('🔴 סולמית = חזרה לתפריט מכל שלב', () => {
  it('מתפריט ההזמנה', () => {
    const { state } = run([{}, { value: '1' }, { value: '#' }])
    expect(state.step).toBe('main_menu')
  })

  it('מתוך דפדוף', () => {
    const { state } = run([
      {}, { value: '1' },
      { value: '3', input: { browseBooks: BOOKS } },
      { value: '#', input: { browseBooks: BOOKS } },
    ])
    expect(state.step).toBe('main_menu')
  })

  // 🔴 העגלה היא לא משהו שמאבדים בלחיצה אחת.
  it('🔴 העגלה נשמרת כשחוזרים לתפריט', () => {
    const withCart: IvrState = {
      ...initialState(), step: 'order_menu',
      items: [{ book_id: 'b1', sku: '0101', title: 'ספר', price_agorot: 100, quantity: 2 }],
    }
    const turn = nextTurn(withCart, { value: '#' })
    expect(turn.state.step).toBe('main_menu')
    expect(turn.state.items).toHaveLength(1)
  })

  // ⚠️ בהקלטה הסולמית היא *סיום ההקלטה* ולא ניווט.
  it('⚠️ בהקלטה הסולמית אינה מנווטת', () => {
    const rec: IvrState = { ...initialState(), step: 'record_inquiry' }
    const turn = nextTurn(rec, { value: '#', recording: 'f.wav', inquirySaved: true })
    expect(turn.state.step).not.toBe('main_menu')
  })
})

describe('🔴 קטגוריות', () => {
  it('מציג את כל הקטגוריות עם מספור רץ', () => {
    const { state, response } = run([
      {}, { value: '1' }, { value: '2', input: { categories: CATS } },
    ])
    expect(state.step).toBe('category_menu')
    expect(response).toContain('שאלות ותשובות')
    expect(response).toContain('דרוש ואגדה')
  })

  it('בחירת קטגוריה פותחת דפדוף בספריה', () => {
    const { state, response } = run([
      {}, { value: '1' },
      { value: '2', input: { categories: CATS } },
      { value: '1', input: { categories: CATS, browseBooks: BOOKS } },
    ])
    expect(state.step).toBe('browse')
    expect(state.browse_category).toBe('שאלות ותשובות')
    expect(response).toContain(BOOKS[0].title)
  })

  it('מספר קטגוריה שאינו קיים — חוזר על הרשימה', () => {
    const { state } = run([
      {}, { value: '1' },
      { value: '2', input: { categories: CATS } },
      { value: '9', input: { categories: CATS } },
    ])
    expect(state.step).toBe('category_menu')
  })
})

describe('🔴 דפדוף ברשימת הספרים', () => {
  const toBrowse = () => run([
    {}, { value: '1' }, { value: '3', input: { browseBooks: BOOKS } },
  ]).state

  it('מתחיל בספר הראשון', () => {
    const s = toBrowse()
    expect(s.step).toBe('browse')
    expect(s.browse_index).toBe(0)
    // ⚠️ null ולא undefined — "כל הקטלוג" ולא "טרם נבחר".
    expect(s.browse_category).toBeNull()
  })

  it('2 מקדם לספר הבא', () => {
    const turn = nextTurn(toBrowse(), { value: '2', browseBooks: BOOKS })
    expect(turn.state.browse_index).toBe(1)
    expect(turn.response).toContain(BOOKS[1].title)
  })

  it('3 חוזר לספר הקודם', () => {
    let s = nextTurn(toBrowse(), { value: '2', browseBooks: BOOKS }).state
    s = nextTurn(s, { value: '3', browseBooks: BOOKS }).state
    expect(s.browse_index).toBe(0)
  })

  // 🔴 בלי זה האינדקס היה יורד ל-‎-1 והרשימה קורסת.
  it('🔴 3 בתחילת הרשימה נשאר במקום ומודיע', () => {
    const turn = nextTurn(toBrowse(), { value: '3', browseBooks: BOOKS })
    expect(turn.state.browse_index).toBe(0)
    expect(turn.response).toContain(MESSAGE_FALLBACKS.list_start)
  })

  it('🔴 סוף הרשימה מודיע ואינו גולש מעבר', () => {
    let s = toBrowse()
    for (let i = 0; i < 10; i++) s = nextTurn(s, { value: '2', browseBooks: BOOKS }).state
    expect(s.browse_index).toBe(BOOKS.length - 1)
    const turn = nextTurn(s, { value: '2', browseBooks: BOOKS })
    expect(turn.response).toContain(MESSAGE_FALLBACKS.list_end)
  })

  it('1 בוחר את הספר ומבקש אישור', () => {
    const turn = nextTurn(toBrowse(), { value: '1', browseBooks: BOOKS })
    expect(turn.state.step).toBe('confirm_book')
    expect(turn.state.pending_book_id).toBe('b1')
    expect(turn.response).toContain(BOOKS[0].title)
  })

  // ⚠️ שם משתנה חדש לכל אינדקס — אחרת ימות מחזירה את ההקשה הקודמת
  // והדפדוף נתקע על אותו ספר לנצח.
  it('⚠️ שם המשתנה משתנה בין ספר לספר', () => {
    const a = nextTurn(toBrowse(), { value: '2', browseBooks: BOOKS })
    const b = nextTurn(a.state, { value: '2', browseBooks: BOOKS })
    expect(a.response).toContain('bf_br1')
    expect(b.response).toContain('bf_br2')
  })

  it('4 מכל הספרים חוזר לתפריט ההזמנה', () => {
    const turn = nextTurn(toBrowse(), { value: '4', browseBooks: BOOKS })
    expect(turn.state.step).toBe('order_menu')
  })

  // 🔴 0 נבלע ב"הבא" וההזמנה לא נסגרה לעולם.
  it('🔴 0 מסיים את ההזמנה כשיש ספרים בעגלה', () => {
    const s = { ...toBrowse(), items: [
      { book_id: 'b1', sku: '0101', title: 'א', price_agorot: 1100, quantity: 1 },
    ] }
    const turn = nextTurn(s, { value: '0', browseBooks: BOOKS })
    expect(turn.state.step).toBe('ask_delivery')
  })

  // ⚠️ בעגלה ריקה אין מה לסגור — 0 ממשיך לדפדף.
  it('0 בעגלה ריקה אינו מסיים', () => {
    const turn = nextTurn(toBrowse(), { value: '0', browseBooks: BOOKS })
    expect(turn.state.step).toBe('browse')
  })

  it('רשימה ריקה אינה קורסת', () => {
    const turn = nextTurn(toBrowse(), { value: '2', browseBooks: [] })
    expect(turn.response).toContain('hangup')
  })
})

describe('🔴 אישור הספר', () => {
  const atConfirm = () => run([
    {}, { value: '1' }, { value: '3', input: { browseBooks: BOOKS } },
    { value: '1', input: { browseBooks: BOOKS } },
  ]).state

  it('מקריא שם ומחיר', () => {
    const turn = nextTurn(
      run([{}, { value: '1' }, { value: '3', input: { browseBooks: BOOKS } }]).state,
      { value: '1', browseBooks: BOOKS },
    )
    expect(turn.response).toContain(BOOKS[0].title)
    expect(turn.response).toContain(MESSAGE_FALLBACKS.confirm_book)
  })

  it('1 ממשיך לכמות', () => {
    const turn = nextTurn(atConfirm(), { value: '1', book: BOOKS[0] })
    expect(turn.state.step).toBe('ask_qty')
  })

  it('2 מחזיר לדפדוף', () => {
    const turn = nextTurn(atConfirm(), { value: '2', browseBooks: BOOKS })
    expect(turn.state.step).toBe('browse')
  })

  // 🔴 מק"ט דומה בטעות היה מזמין ספר אחר בלי שהמתקשר ידע.
  it('🔴 גם במסלול המק"ט יש אישור לפני כמות', () => {
    const s: IvrState = { ...initialState(), step: 'ask_sku' }
    const turn = nextTurn(s, { value: '0101', book: BOOKS[0] })
    expect(turn.state.step).toBe('confirm_book')
    expect(turn.response).toContain(BOOKS[0].title)
  })
})

describe('🔴 הזמנות קיימות', () => {
  it('אין הזמנות — הודעה וניתוק', () => {
    const turn = nextTurn(
      { ...initialState(), step: 'main_menu' },
      { value: '2', myOrders: [] },
    )
    expect(turn.response).toContain(MESSAGE_FALLBACKS.orders_none)
    expect(turn.response).toContain('hangup')
  })

  // 🔴 המספר נשמע ספרה-ספרה: "121201" כמספר שלם מוקרא "מאה עשרים
  // ואחד אלף מאתיים ואחת", ואי אפשר לרשום אותו בטלפון.
  it('מקריא את מספר ההזמנה ספרה-ספרה', () => {
    const turn = nextTurn(
      { ...initialState(), step: 'main_menu' },
      { value: '2', myOrders: [
        { order_number: '121201', total_agorot: 1100, status: 'שולם', statusCode: 'paid' },
      ] },
    )
    expect(turn.response).toContain('d-121201')
    expect(turn.response).toContain(MESSAGE_FALLBACKS.status_paid)
  })

  // ⚠️ הזמנות ישנות נושאות מספר עם אותיות שימות אינה יודעת להקריא.
  it('ממספר עם אותיות מוקרא החלק הנומרי', () => {
    const turn = nextTurn(
      { ...initialState(), step: 'main_menu' },
      { value: '2', myOrders: [
        { order_number: 'BF-26-KCZ34E', total_agorot: 4100, status: 'שולם', statusCode: 'paid' },
      ] },
    )
    // ⚠️ "BF-26-KCZ34E" → "2634": הספרות בלבד, כי ימות אינה מקריאה
    // אותיות לטיניות. מספר כזה אינו ניתן למסירה בטלפון — ולכן
    // ההזמנות החדשות נומריות.
    expect(turn.response).toContain('d-2634')
  })

  // 🔴 טוקן "t-" ריק גורם לשתיקה באמצע המשפט.
  it('אין טוקן ריק כשהסטטוס לא מוכר', () => {
    const turn = nextTurn(
      { ...initialState(), step: 'main_menu' },
      { value: '2', myOrders: [{ order_number: '121201', total_agorot: 1100, status: '' }] },
    )
    expect(turn.response).not.toContain('.t-.')
    expect(turn.response).not.toContain('t-&')
  })
})

describe('🔴 פנייה לשירות לקוחות', () => {
  it('הקלטה שנשמרה — אישור', () => {
    const s: IvrState = { ...initialState(), step: 'record_inquiry' }
    const turn = nextTurn(s, { recording: 'inq.wav', inquirySaved: true })
    expect(turn.response).toContain(MESSAGE_FALLBACKS.inquiry_saved)
  })

  // ⚠️ כשל שמירה חייב להישמע, ולא להסתיים ב"תודה" מטעה.
  it('⚠️ כשל שמירה נאמר במפורש', () => {
    const s: IvrState = { ...initialState(), step: 'record_inquiry' }
    const turn = nextTurn(s, { recording: 'inq.wav', inquirySaved: false })
    expect(turn.response).toContain(MESSAGE_FALLBACKS.inquiry_failed)
  })

  it('בלי הקלטה — מבקש שוב', () => {
    const s: IvrState = { ...initialState(), step: 'record_inquiry' }
    const turn = nextTurn(s, {})
    expect(turn.state.step).toBe('record_inquiry')
  })
})
