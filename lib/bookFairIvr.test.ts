import { describe, it, expect } from 'vitest'
import { nextTurn, initialState, ttsClean, type IvrState, type IvrResponse } from './bookFairIvr'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מה שהמתקשר שומע — הדבר היחיד שבאמת חשוב, ושאי אפשר לראות בשום לוג
// אחרי שהוא ניתק.
//
// ⚠️ המלכודת של טכנוליין: JSON לא תקין או type לא מוכר מחזיר את המתקשר
// לתפריט הקודם *בשקט*. מבחינתו "התפריט חוזר על עצמו" — ואין שום דרך
// לדעת מהשרת שזה קרה. לכן כל מסלול נבדק כאן.
// ─────────────────────────────────────────────────────────────────────────────

const BOOK = { id: 'b1', sku: '1001', title: 'שולחן ערוך', price_agorot: 12000, in_stock: true }
const CITY = { id: 'c1', name: 'בני ברק' }

/** כל הטקסט שהמתקשר שומע בתשובה — לבדיקות תוכן. */
function heard(r: IvrResponse): string {
  if (!('files' in r) || !r.files) return ''
  return r.files.map(f =>
    'text' in f ? f.text : 'number' in f ? f.number : 'digits' in f ? f.digits : ''
  ).join(' ')
}

describe('ttsClean', () => {
  // ⚠️ גרש בתוך שם ספר ("שו״ת") עלול לשבש את ההקראה כולה
  it('⚠️ מסיר גרשיים ותווים בעייתיים', () => {
    expect(ttsClean('שו"ת חתם סופר')).toBe('שו ת חתם סופר')
    expect(ttsClean("רמב'ם")).toBe('רמב ם')
    expect(ttsClean('ספר — חלק א')).toBe('ספר חלק א')
  })

  it('מסיר תווי כיווניות בלתי נראים', () => {
    expect(ttsClean('‏שולחן ערוך')).toBe('שולחן ערוך')
  })
})

describe('פתיחת השיחה', () => {
  it('מברכת ומבקשת מק"ט', () => {
    const t = nextTurn(initialState())
    expect(t.response.type).toBe('getDTMF')
    expect(heard(t.response)).toContain('ברוכים הבאים')
    expect(heard(t.response)).toContain('מספר הקטלוג')
    expect(t.state.step).toBe('ask_sku')
  })
})

describe('🔴 בחירת ספר', () => {
  const afterWelcome = nextTurn(initialState()).state

  it('מקריא שם ומחיר', () => {
    const t = nextTurn(afterWelcome, { value: '1001', book: BOOK })
    const text = heard(t.response)
    expect(text).toContain('שולחן ערוך')
    expect(text).toContain('120')       // ₪120 מוקרא כ-120
    expect(text).toContain('שקלים')
    expect(t.state.step).toBe('ask_qty')
  })

  it('מק"ט לא קיים — מבקש שוב', () => {
    const t = nextTurn(afterWelcome, { value: '9999', book: null })
    expect(heard(t.response)).toContain('לא נמצא')
    expect(t.state.step).toBe('ask_sku')
  })

  // 🔴 ספר שאזל בערוץ הטלפוני — ההודעה מפורשת שזה "בקו הטלפוני",
  // כי ייתכן שבאתר הוא עדיין זמין (המלאי מופרד קשיחות)
  it('🔴 ספר שאזל — הודעה מפורשת על הערוץ', () => {
    const t = nextTurn(afterWelcome, { value: '1001', book: { ...BOOK, in_stock: false } })
    expect(heard(t.response)).toContain('אזל')
    expect(heard(t.response)).toContain('הטלפוני')
  })

  // ⚠️ משתנה שכבר מלא + קריאה חוזרת = לולאה אינסופית במרכזייה
  it('⚠️ כל ניסיון חוזר מקבל שם משתנה חדש', () => {
    let s = afterWelcome
    const names: string[] = []
    for (let i = 0; i < 2; i++) {
      const t = nextTurn(s, { book: null })
      if ('name' in t.response && t.response.name) names.push(t.response.name)
      s = t.state
    }
    expect(new Set(names).size).toBe(names.length)
  })

  // 🔴 בלי תקרה, מתקשר שמקיש שגוי נתקע בלולאה שנראית כמו תקלה
  it('🔴 אחרי שלושה כשלים — ניתוק מנומס ולא לולאה', () => {
    let s = afterWelcome
    let r: IvrResponse = { type: 'hangup' }
    for (let i = 0; i < 3; i++) {
      const t = nextTurn(s, { book: null })
      s = t.state; r = t.response
    }
    expect(s.step).toBe('done')
    expect(heard(r)).toContain('התקשרו למשרד')
  })
})

describe('כמות', () => {
  const s: IvrState = { step: 'ask_qty', items: [], attempts: 0 }

  it('מוסיף לסל ושואל אם להמשיך', () => {
    const t = nextTurn(s, { value: '3', book: BOOK, reserved: true })
    expect(t.state.items).toHaveLength(1)
    expect(t.state.items[0].quantity).toBe(3)
    expect(heard(t.response)).toContain('להוספת ספר נוסף')
    expect(t.state.step).toBe('ask_more')
  })

  it('כמות פסולה — מבקש שוב', () => {
    for (const v of ['0', '-1', '99', 'abc', '']) {
      const t = nextTurn(s, { value: v, book: BOOK })
      expect(t.state.items).toHaveLength(0)
    }
  })

  // 🔴 המלאי אזל בין הבחירה לשריון — חוזרים למק"ט ולא ממשיכים
  it('🔴 שריון שנכשל מחזיר לבחירת ספר', () => {
    const t = nextTurn(s, { value: '2', book: BOOK, reserved: false })
    expect(t.state.items).toHaveLength(0)
    expect(t.state.step).toBe('ask_sku')
    expect(heard(t.response)).toContain('אינה זמינה')
  })
})

describe('אופן המסירה', () => {
  const withItem: IvrState = {
    step: 'ask_more', attempts: 0,
    items: [{ book_id: 'b1', sku: '1001', title: 'ספר', price_agorot: 12000, quantity: 1 }],
  }

  it('מעבר לבחירת מסירה', () => {
    const t = nextTurn(withItem, { value: '2' })
    expect(t.state.step).toBe('ask_delivery')
    expect(heard(t.response)).toContain('איסוף עצמי')
    expect(heard(t.response)).toContain('משלוח')
  })

  // ⚠️ איסוף עצמי מדלג על עיר וכתובת לגמרי
  it('⚠️ איסוף עצמי — בלי עיר ובלי כתובת', () => {
    const t = nextTurn({ ...withItem, step: 'ask_delivery' }, { value: '1' })
    expect(t.state.delivery).toBe('pickup')
    expect(t.state.shipping_agorot).toBe(0)
    expect(t.state.step).toBe('ask_name')
  })

  it('משלוח — עובר לקוד עיר', () => {
    const t = nextTurn({ ...withItem, step: 'ask_delivery' }, { value: '2' })
    expect(t.state.delivery).toBe('shipping')
    expect(t.state.step).toBe('ask_city')
  })
})

describe('🔴 עיר וכתובת', () => {
  const s: IvrState = {
    step: 'ask_city', attempts: 0, delivery: 'shipping',
    items: [{ book_id: 'b1', sku: '1001', title: 'ספר', price_agorot: 12000, quantity: 1 }],
  }

  it('עיר תקינה — עובר להקלטת כתובת', () => {
    const t = nextTurn(s, { city: CITY, shipping_agorot: 3500 })
    expect(t.state.city_name).toBe('בני ברק')
    expect(t.state.shipping_agorot).toBe(3500)
    expect(t.response.type).toBe('record')
  })

  // 🔴 ההטיה למאגר הרחובות מוגבלת לעיר שנבחרה: ירושלים לבדה היא
  // כ-4,380 רחובות והתקרה 5,000 — עיר אחת בכל פעם
  it('🔴 הזיהוי הקולי מוגבל לרחובות העיר שנבחרה', () => {
    const t = nextTurn(s, { city: CITY, shipping_agorot: 3500 })
    if (t.response.type !== 'record') throw new Error('ציפינו ל-record')
    expect(t.response.sttMode).toBe('streets')
    expect(t.response.sttCities).toBe('בני ברק')
  })

  // 🔴 ההקלטה נשמרת תמיד; התמלול הוא הצעה בלבד למשרד
  it('🔴 הקלטה עם תמלול רקע — לא לולאת אישור על הטקסט', () => {
    const t = nextTurn(s, { city: CITY, shipping_agorot: 3500 })
    if (t.response.type !== 'record') throw new Error('ציפינו ל-record')
    expect(t.response.sttSoft).toBe(true)
    // ⚠️ record ולא stt: stt כופה לולאת "אמרו שוב" עד שהתמלול מצליח,
    // ותמלול עברית על קו טלפון נכשל מספיק כדי לתקוע מתקשר
    expect(t.response.type).not.toBe('stt')
  })

  it('קוד עיר לא מוכר — מסביר שמשלוחים מוגבלים', () => {
    const t = nextTurn(s, { city: null })
    expect(heard(t.response)).toContain('אינו מוכר')
    expect(heard(t.response)).toContain('בלבד')
  })

  // 🔴 null ≠ חינם. המשך בסכום 0 היה גורם לעמותה לשלוח על חשבונה
  it('🔴 אין מדרגת תעריף — מפנה למשרד ולא ממשיך בחינם', () => {
    const t = nextTurn(s, { city: CITY, shipping_agorot: null })
    expect(t.state.step).toBe('done')
    expect(heard(t.response)).toContain('התקשרו למשרד')
    expect(t.state.shipping_agorot).toBeUndefined()
  })

  it('הקלטת כתובת נשמרת', () => {
    const t = nextTurn(
      { ...s, step: 'record_address', city_name: 'בני ברק', shipping_agorot: 3500 },
      { recording: 'rec-123', transcript: 'רבי עקיבא 5' }
    )
    expect(t.state.address_recording).toBe('rec-123')
    expect(t.state.address_transcript).toBe('רבי עקיבא 5')
    expect(t.state.step).toBe('ask_name')
  })
})

describe('🔴 אישור הסכום', () => {
  const s: IvrState = {
    step: 'ask_name', attempts: 0, delivery: 'shipping', shipping_agorot: 3500,
    items: [
      { book_id: 'b1', sku: '1001', title: 'ספר א', price_agorot: 12000, quantity: 2 },
      { book_id: 'b2', sku: '1002', title: 'ספר ב', price_agorot: 4590, quantity: 1 },
    ],
  }

  it('מקריא פירוט מלא', () => {
    const t = nextTurn(s, { recording: 'rec-name' })
    const text = heard(t.response)
    expect(text).toContain('286')   // 240 + 45.90 → 285.90 → 286 כלפי מעלה
    expect(text).toContain('35')    // משלוח
    expect(text).toContain('321')   // סך הכול 320.90 → 321
    expect(text).toContain('לתשלום בכרטיס אשראי')
  })

  it('איסוף עצמי — אומר "ללא דמי משלוח"', () => {
    const t = nextTurn({ ...s, delivery: 'pickup', shipping_agorot: 0 }, { recording: 'r' })
    expect(heard(t.response)).toContain('ללא דמי משלוח')
  })

  it('ביטול', () => {
    const t = nextTurn({ ...s, step: 'confirm_total' }, { value: '2' })
    expect(t.state.step).toBe('done')
    expect(heard(t.response)).toContain('בוטלה')
  })
})

describe('🔴 סליקה', () => {
  const s: IvrState = {
    step: 'confirm_total', attempts: 0, shipping_agorot: 3500,
    items: [{ book_id: 'b1', sku: '1001', title: 'ספר', price_agorot: 12000, quantity: 1 }],
  }

  // 🔴 מודול הסליקה של המרכזייה: פרטי הכרטיס לעולם אינם עוברים דרך
  // השרת שלנו, ולכן אין כאן חשיפת פרטי אשראי
  it('🔴 משתמש במודול הסליקה של המרכזייה', () => {
    const t = nextTurn(s, { value: '1' })
    expect(t.response.type).toBe('creditCard')
  })

  // 🔴 בלי זה, מספר הכרטיס והקוד נכתבים ללוגים
  it('🔴 maskLog פעיל', () => {
    const t = nextTurn(s, { value: '1' })
    if (t.response.type !== 'creditCard') throw new Error('ציפינו ל-creditCard')
    expect(t.response.maskLog).toBe(true)
  })

  it('הסכום מעוגל כלפי מעלה לשקל שלם', () => {
    const t = nextTurn(s, { value: '1' })
    if (t.response.type !== 'creditCard') throw new Error('ציפינו ל-creditCard')
    expect(t.response.sum).toBe(155)   // 120 + 35
  })

  it('תשלום שהצליח — מקריא מספר הזמנה', () => {
    const t = nextTurn({ ...s, step: 'payment' }, { payment: 'success', order_number: 'BF-26-A7K2M9' })
    expect(heard(t.response)).toContain('התקבל בהצלחה')
    expect(t.state.step).toBe('done')
  })

  // ⚠️ מספר הזמנה מוקלד חזרה — הקראה כמספר שלם הופכת אותו לבלתי
  // ניתן לרישום
  it('⚠️ מספר ההזמנה מוקרא ספרה-ספרה', () => {
    const t = nextTurn({ ...s, step: 'payment' }, { payment: 'success', order_number: 'BF-26-A7K2M9' })
    if (!('files' in t.response)) throw new Error('ציפינו לקובץ')
    expect(t.response.files.some(f => 'digits' in f)).toBe(true)
  })

  it('תשלום שנכשל — אומר שההזמנה לא נקלטה', () => {
    const t = nextTurn({ ...s, step: 'payment' }, { payment: 'failed' })
    expect(heard(t.response)).toContain('לא אושר')
    expect(heard(t.response)).toContain('לא נקלטה')
  })
})

describe('🔴 שלמות — כל תשובה היא מודול תקין', () => {
  // 🔴 type לא מוכר = המתקשר מוחזר לתפריט הקודם בשקט, וזה נראה לו
  // כמו תקלה. כל מסלול חייב להחזיר מודול שהמרכזייה מכירה.
  const VALID = ['simpleMessage', 'getDTMF', 'simpleMenu', 'record', 'stt', 'creditCard', 'hangup']

  it('🔴 כל מצב מחזיר type מוכר, גם עם קלט ריק', () => {
    const steps: IvrState['step'][] = [
      'welcome', 'ask_sku', 'ask_qty', 'ask_more', 'ask_delivery',
      'ask_city', 'record_address', 'ask_name', 'confirm_total', 'payment', 'done',
    ]
    for (const step of steps) {
      const t = nextTurn({ step, items: [], attempts: 0 })
      expect(VALID, `שלב ${step}`).toContain(t.response.type)
    }
  })

  it('🔴 שיחה מלאה מקצה לקצה מגיעה לסיום', () => {
    let s = initialState()
    s = nextTurn(s).state                                              // ברכה
    s = nextTurn(s, { value: '1001', book: BOOK }).state               // מק"ט
    s = nextTurn(s, { value: '2', book: BOOK, reserved: true }).state  // כמות
    expect(s.items).toHaveLength(1)
    s = nextTurn(s, { value: '2' }).state                              // סיום הוספה
    s = nextTurn(s, { value: '2' }).state                              // משלוח
    s = nextTurn(s, { city: CITY, shipping_agorot: 3500 }).state       // עיר
    s = nextTurn(s, { recording: 'r1', transcript: 'רבי עקיבא 5' }).state
    s = nextTurn(s, { recording: 'r2' }).state                         // שם
    expect(s.step).toBe('confirm_total')
    s = nextTurn(s, { value: '1' }).state                              // לתשלום
    expect(s.step).toBe('payment')
    const final = nextTurn(s, { payment: 'success', order_number: 'BF-26-XYZ789' })
    expect(final.state.step).toBe('done')
    expect(heard(final.response)).toContain('בהצלחה')
  })
})
