import { describe, it, expect } from 'vitest'
import { parseStatus, normOrderNumber, detectColumns, planRows, type OrderInfo } from './bookFairBulkStatus'

const orders = new Map<string, OrderInfo>([
  ['121213', { status: 'picking' }],
  ['121214', { status: 'paid' }],
  ['121215', { status: 'delivered' }],
  ['121216', { status: 'cancelled' }],
  ['121217', { status: 'shipped' }],
  ['121218', { status: 'paid' }],
])
const known = new Set(orders.keys())

describe('פענוח סטטוס', () => {
  it('ניסוחים חופשיים', () => {
    expect(parseStatus('נשלחה')).toBe('shipped')
    expect(parseStatus(' יצא למשלוח ')).toBe('shipped')
    expect(parseStatus('Shipped')).toBe('shipped')
    expect(parseStatus('נִמְסַר')).toBe('delivered')
    expect(parseStatus('בוטל')).toBe('cancelled')
    expect(parseStatus('משהו')).toBeNull()
  })
  it('מספר הזמנה כמספר או טקסט', () => {
    expect(normOrderNumber(121213)).toBe('121213')
    expect(normOrderNumber(121213.0)).toBe('121213')
    expect(normOrderNumber(' #121213 ')).toBe('121213')
  })
})

describe('זיהוי עמודות לפי תוכן', () => {
  it('הסדר בקובץ אינו משנה, והכותרת מזוהה', () => {
    const rows = [
      ['הערה', 'סטטוס משלוח', 'מס הזמנה'],
      ['x', 'נשלח', 121213],
      ['y', 'נמסר', '121214'],
    ]
    expect(detectColumns(rows, known)).toEqual({ orderCol: 2, statusCol: 1, addressCol: -1, cityCol: -1, headerRow: true })
  })
  it('בלי כותרת', () => {
    expect(detectColumns([[121213, 'נשלח']], known)).toEqual({ orderCol: 0, statusCol: 1, addressCol: -1, cityCol: -1, headerRow: false })
  })
  it('אין מספרי הזמנה מוכרים ⇒ null', () => {
    expect(detectColumns([[999, 'נשלח']], known)).toBeNull()
  })
})

describe('תכנון השינויים', () => {
  const cols = { orderCol: 0, statusCol: 1, addressCol: -1, cityCol: -1, headerRow: false }
  const plan = planRows([
    [121213, 'נשלח'],        // בליקוט → נשלח: קפיצה מותרת
    [121214, 'שולם'],        // ללא שינוי
    [999999, 'נשלח'],        // לא קיים
    [121217, 'לא ידוע'],     // סטטוס לא מוכר
    [121215, 'נשלח'],        // נמסר → לא חוזרים מקובץ
    [121216, 'נשלח'],        // מבוטלת
    [121218, 'זוכה'],        // זיכוי — חסום
    [121213, 'נמסר'],        // כפילות
    ['', ''],                // ריקה — מדולגת
  ], cols, orders)

  it('קפיצה קדימה מותרת', () => expect(plan[0]).toMatchObject({ kind: 'change', current: 'picking', target: 'shipped' }))
  it('אותו סטטוס = ללא שינוי', () => expect(plan[1].kind).toBe('same'))
  it('הזמנה לא קיימת', () => expect(plan[2]).toMatchObject({ kind: 'error', error: 'מספר הזמנה לא קיים במערכת' }))
  it('סטטוס לא מוכר', () => expect(plan[3].error).toContain('סטטוס לא מוכר'))
  it('נמסרה — לא משנים מקובץ', () => expect(plan[4].error).toContain('כבר נמסרה'))
  it('מבוטלת — לא משנים מקובץ', () => expect(plan[5].error).toContain('בוטל'))
  it('זיכוי חסום', () => expect(plan[6].error).toContain('זיכוי'))
  it('כפילות', () => expect(plan[7].error).toBe('ההזמנה מופיעה כבר בשורה 1'))
  it('שורה ריקה מדולגת', () => expect(plan).toHaveLength(8))
})

describe('עדכון כתובת', () => {
  const ship = new Map<string, OrderInfo>([
    ['200001', { status: 'picking', delivery_method: 'shipping', address_text: 'הרב קוק 5', city_id: 'c1' }],
    ['200002', { status: 'paid', delivery_method: 'pickup' }],
    ['200003', { status: 'paid', delivery_method: 'shipping', address_text: 'רחוב א 1', city_id: 'c1' }],
  ])
  const cities = new Map([['בני ברק', { id: 'c2', name: 'בני ברק' }]])
  const rows = [
    ['מספר הזמנה', 'סטטוס', 'כתובת', 'עיר'],
    [200001, '', 'רבי עקיבא 12', 'בני-ברק'],
    [200002, '', 'רחוב ב 2', ''],
    [200003, 'נשלח', 'רחוב א 1', ''],
    [200003, '', 'x', ''],
  ]

  it('כתובת ועיר מזוהות לפי הכותרת', () => {
    expect(detectColumns(rows, new Set(ship.keys()))).toMatchObject({ orderCol: 0, statusCol: 1, addressCol: 2, cityCol: 3, headerRow: true })
  })

  const cols = detectColumns(rows, new Set(ship.keys()))!
  const plan = planRows(rows, cols, ship, cities)

  it('כתובת בלי סטטוס — שינוי כתובת ועיר', () => {
    expect(plan[0]).toMatchObject({ kind: 'change', target: null, address: 'רבי עקיבא 12', oldAddress: 'הרב קוק 5', city: { id: 'c2' } })
  })
  it('איסוף עצמי — שגיאה', () => expect(plan[1].error).toContain('איסוף עצמי'))
  it('אותה כתובת + סטטוס חדש — רק הסטטוס', () => {
    expect(plan[2]).toMatchObject({ kind: 'change', target: 'shipped' })
    expect(plan[2].address).toBeUndefined()
  })
  it('קובץ של כתובות בלבד (בלי סטטוס) מזוהה', () => {
    const r = [['הזמנה', 'כתובת'], [200001, 'רחוב חדש 3']]
    expect(detectColumns(r, new Set(ship.keys()))).toMatchObject({ statusCol: -1, addressCol: 1 })
  })
})
