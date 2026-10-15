import { describe, expect, it } from 'vitest'
import { buildBookletImport, joinAddress, mapColumns, planBookletWrite, splitPhones } from './gilyonotDistributorBooklet'
import { cleanCity, cleanRoute, splitCityArea } from './gilyonotDistributors'

describe('נרמול ערים', () => {
  it('כתיבים שונים → שם אחד', () => {
    for (const v of ['ירושלים ', 'ירושלם', 'ירושליים']) expect(cleanCity(v)).toBe('ירושלים')
    for (const v of ['בניברק', 'בני נרק', 'בני בג', 'בני  ברק ', '"בני ברק"']) expect(cleanCity(v)).toBe('בני ברק')
    for (const v of ['ביתר', 'ביתר עלית', 'ביתר עילית ']) expect(cleanCity(v)).toBe('ביתר עילית')
    expect(cleanCity('בית שמש    ')).toBe('בית שמש')
    expect(cleanCity('מודיעין עילית ')).toBe('מודיעין עילית')
  })
  it('עיר לא מוכרת נשמרת כפי שנכתבה, וריק → null', () => {
    expect(cleanCity(' חדרה ')).toBe('חדרה')
    expect(cleanCity('')).toBeNull()
  })
  it('עיר עם שכונה', () => {
    expect(splitCityArea('ירושלים -קטמון')).toEqual({ city: 'ירושלים', area: 'קטמון' })
    expect(splitCityArea('תל-אביב')).toEqual({ city: 'תל-אביב', area: null })
  })
  it('מספר מסלול', () => {
    expect(cleanRoute(' 12 ')).toBe(12)
    expect(cleanRoute('')).toBeNull()
    expect(cleanRoute('3.5')).toBeUndefined()
    expect(cleanRoute('0')).toBeUndefined()
  })
})

describe('טלפונים וכתובת', () => {
  it('פיצול שני מספרים בתא אחד', () => {
    expect(splitPhones('0583287555/0534154971')).toEqual({ phones: ['0583287555', '0534154971'], bad: false })
    expect(splitPhones('0533162986         089380460')).toEqual({ phones: ['0533162986', '089380460'], bad: false })
    expect(splitPhones('053-3144131')).toEqual({ phones: ['0533144131'], bad: false })
    expect(splitPhones('05272124992')).toEqual({ phones: [], bad: true })
    expect(splitPhones('54849495')).toEqual({ phones: [], bad: true })
  })
  it('כתובת מרחוב, בניין ודירה — בלי לכפול מספר', () => {
    expect(joinAddress('חוני המעגל', '16', 'ב')).toBe('חוני המעגל 16, ב')
    expect(joinAddress('כתב סופר 18', '18', '5')).toBe('כתב סופר 18, דירה 5')
    expect(joinAddress('', '', '')).toBeNull()
    expect(joinAddress('הרב קוק', '3', '', 'קטמון')).toBe('הרב קוק 3 (קטמון)')
  })
  it('זיהוי עמודות החוברת', () => {
    const m = mapColumns(['חותמת זמן', 'שם:', 'משפחה:', 'טלפון נייד ליצירת קשר:', 'ת.ז', 'עיר:', 'רחוב:', 'מספר בנין', 'קומה\\דירה',
      'שם בית הכנסת:', 'כתובת בית הכנסת', 'השתייכות קהילתית?', 'מספר המתפללים משוער', 'כמות', 'האם תוכלו להפיץ בבית כנסת נוסף אם כן, מלאו כאן שוב את הפרטים הנ"ל',
      'הערות מיוחדות לשליח:', 'שמות לקויטל:', 'אימייל'])
    expect(m).toEqual({ first: 1, last: 2, phone: 3, id: 4, city: 5, street: 6, building: 7, apt: 8, synagogue: 9, synagogueAddress: 10,
      community: 11, worshippers: 12, quantity: 13, extra: 14, courier: 15, kvitel: 16, email: 17 })
  })
})

const HEAD = ['שם:', 'משפחה:', 'טלפון', 'ת.ז', 'עיר:', 'רחוב:', 'מספר בנין', 'קומה\\דירה', 'שם בית הכנסת:', 'כמות', 'הערות לשליח', 'אימייל', 'עמודה1']
const booklet = [
  HEAD,
  ['משה', 'כהן', '0521111111', '18', 'בני ברק ', 'רבי עקיבא', '10', '3', 'אהל', '20', 'בדלת', '', 'm@x.co'],
  ['אליהו', 'לוי', '0522222222', '', 'בניברק', 'הרב פרדו', '3', '', 'א', '15', '', '', ''],
  ['מנחם', 'לוי', '0522222222', '123', 'בני ברק', 'הרב פרדו', '3', '', 'ב', '30', '', '', ''],
  ['יואל', 'סמט', '0583287555/0534154971', '', 'ירושלם', 'יפו', '1', '', '', '10', '', '', ''],
  ['שלמה', 'שוורץ', '54849495', '', 'ירושלים', '', '', '', '', '25', '', '', ''],
  ['משה', 'כהן', '0521111111', '', 'בני ברק', '', '', '', 'אהל', '20', '', '', ''],
]
const merged = { name: 'מאוחד', rows: [
  ['מסלול', 'שם', 'משפחה:', 'טלפון נייד', 'עיר:', 'רחוב:', 'מספר בנין', 'קומה\\דירה', 'כמות'],
  ['7', 'משה', 'כהן', '0521111111', 'בני ברק', '', '', '', '20'],
  ['9', 'פלוני', 'אלמוני', '0599999999', 'חיפה', '', '', '', '5'],
] }
// גיליון עיר בלי שורת כותרות, באותו סדר עמודות
const bneiBrak = { name: 'בני ברק', rows: [
  ['1', 'משה', 'כהן', '0521111111', 'בני ברק', '', '', '', '20'],
  ['2', 'מנחם', 'לוי', '0522222222', 'בני ברק', '', '', '', '30'],
  ['3', 'אליהו', 'לוי', '0522222222', 'בני ברק', '', '', '', '15'],
  ['', 'בלי', 'מסלול', '0523333333', 'בני ברק', '', '', '', '1'],
] }

describe('חיבור החוברת לקובץ המסלולים', () => {
  const { rows, report } = buildBookletImport(booklet, [merged, bneiBrak])
  const by = (n: string) => rows.find(r => r.full_name === n)!

  it('סכומים: כל הכמויות נספרות, ושורה בלי טלפון תקין לא נכתבת', () => {
    expect(report.registrations).toBe(6)
    expect(report.quantityInFile).toBe(120)
    expect(report.skipped).toEqual([{ line: 6, name: 'שלמה שוורץ', value: '54849495', note: 'מספר טלפון לא תקין' }])
    expect(report.duplicates).toHaveLength(1)
    expect(report.written).toBe(4)
    expect(report.quantityWritten).toBe(75)
    expect(rows.reduce((s, r) => s + r.quantity, 0)).toBe(report.quantityWritten)
  })
  it('שדות מורכבים: שם מלא, כתובת, עיר אחידה, מייל מעמודה לא מזוהה, טלפון מפוצל', () => {
    expect(by('משה כהן')).toMatchObject({ city: 'בני ברק', address: 'רבי עקיבא 10, דירה 3', email: 'm@x.co', id_number: '000000018', notes: 'לשליח: בדלת' })
    expect(by('יואל סמט')).toMatchObject({ city: 'ירושלים', phone: '0583287555', phone2: '0534154971' })
    expect(by('מנחם לוי').notes).toBe('ת.ז. כפי שנמסרה: 123')
    expect(report.badId).toEqual([{ line: 4, name: 'מנחם לוי', value: '123' }])
  })
  it('גיליון העיר גובר על המאוחד, וטלפון משותף מוכרע לפי השם', () => {
    expect(by('משה כהן').route).toBe(1)
    expect(by('מנחם לוי').route).toBe(2)
    expect(by('אליהו לוי').route).toBe(3)
    expect(by('יואל סמט').route).toBeNull()
    expect(report.route.conflicts).toHaveLength(1)
    expect(report.route.unmatched.map(u => u.name)).toEqual(['פלוני אלמוני'])
    expect(report.sharedPhone).toEqual([{ phone: '0522222222', names: ['אליהו לוי', 'מנחם לוי'] }])
  })
  it('מיון לפי עיר ואז מסלול, וסיכום לפי עיר', () => {
    expect(rows.map(r => r.full_name)).toEqual(['משה כהן', 'מנחם לוי', 'אליהו לוי', 'יואל סמט'])
    expect(report.byCity).toEqual([
      { city: 'בני ברק', distributors: 3, quantity: 65, withRoute: 3 },
      { city: 'ירושלים', distributors: 1, quantity: 10, withRoute: 0 },
    ])
  })
  it('חוברת בלי עמודות שם/טלפון — שגיאה', () => {
    expect(buildBookletImport([['x', 'y']], []).error).toMatch(/שם/)
  })
})

describe('planBookletWrite', () => {
  const { rows } = buildBookletImport(booklet, [merged, bneiBrak])
  it('קיים לפי טלפון+שם: מסלול מתעדכן ושדות ריקים מתמלאים, בלי לדרוס עריכה', () => {
    const base = { phone2: null, email: null, id_number: null, address: null, synagogue: null, notes: null, route: null }
    const plan = planBookletWrite([
      { ...base, id: 'a', full_name: 'משה  כהן', phone: '0521111111', city: 'בני ברק', quantity: 50, notes: 'מהמשרד' },
      { ...base, id: 'b', full_name: 'יואל סמט', phone: '0583287555', city: 'ירושלים', quantity: 10, address: 'יפו 1' , email: 'y@x.co' },
    ], rows)
    expect(plan.updates.find(u => u.id === 'a')!.patch).toEqual({ route: 1, email: 'm@x.co', id_number: '000000018', address: 'רבי עקיבא 10, דירה 3', synagogue: 'אהל' })
    expect(plan.updates.find(u => u.id === 'b')!.patch).toEqual({ phone2: '0534154971' })
    expect(plan.inserts.map(r => r.full_name)).toEqual(['מנחם לוי', 'אליהו לוי'])
    expect(plan.inserts[0]).not.toHaveProperty('line')
  })
  it('ייבוא חוזר אחרי שהכול נכתב — אין שינוי', () => {
    const existing = rows.map((r, i) => ({ ...r, id: String(i) }))
    expect(planBookletWrite(existing, rows)).toEqual({ inserts: [], updates: [], unchanged: rows.length })
  })
})
