import { describe, it, expect } from 'vitest'
import { getApprovedRefLookup, invalidateApprovedRef, buildApprovedRefTree } from './lineageApprovedRef'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 "ומרת" מול "ו" — הבאג שחסם אישור יולדות (15.09, לוק אביגיל).
//
// בקובץ "רבי רפאל ורחל דויטש", ובעץ "רבי רפאל ומרת רחל דויטש". אותו אדם,
// מילה אחת שונה — ודור 3 נצבע אדום, וכך גם דור 4. הכרטסת הראתה חריגת
// ייחוס שאינה קיימת, והמזכירות לא יכלה לאשר.
// ─────────────────────────────────────────────────────────────────────────────
const REF = [
  { name: 'רבי רפאל ורחל דויטש', generation: 3 },
  { name: 'רבי שמחה בונם ואסתר דויטש', generation: 4 },
  { name: 'רבי משה ושרה קורניצר', generation: 3 },
  { name: 'רבי אברהם שמואל בנימין בעל הכתב סופר', generation: 2 },
]
const fakeDb = (rows = REF) => ({ from: () => ({ select: async () => ({ data: rows, error: null }) }) })

describe('🔴 התאמה לקובץ המאושר — "ומרת" מול "ו"', () => {
  it('🔴 "ומרת רחל" מתאים ל"ורחל" באותו דור', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי רפאל ומרת רחל דויטש', 3)).toBe(true)
  })

  it('🔴 גם בדור 4 — שמחה בונם', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי שמחה בונם ומרת אסתר דויטש', 4)).toBe(true)
  })

  it('התאמה מלאה ממשיכה לעבוד', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי רפאל ורחל דויטש', 3)).toBe(true)
  })

  // 🔴 הדור עדיין מכריע — אחרת נין מוצג כבן.
  it('🔴 אותו שם בדור אחר → לא מתאים', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי רפאל ומרת רחל דויטש', 5)).toBe(false)
  })

  // 🔴 שם המשפחה נשמר — "משה קורניצר" ו"משה סופר" אינם אותו אדם.
  it('🔴 שם משפחה שונה → לא מתאים', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי משה ומרת שרה סופר', 3)).toBe(false)
  })

  it('שם שאינו בקובץ → לא מתאים', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb())
    expect(inRef('רבי פלוני ומרת אלמונית כהן', 3)).toBe(false)
  })

  // ⚠️ הנתיב הממוטמן חייב להתנהג זהה — אחרת הצבע תלוי במטמון.
  it('🔴 הקריאה השנייה (ממטמון) מתנהגת זהה', async () => {
    invalidateApprovedRef()
    await getApprovedRefLookup(fakeDb())
    const cached = await getApprovedRefLookup(fakeDb())
    expect(cached('רבי רפאל ומרת רחל דויטש', 3)).toBe(true)
    expect(cached('רבי רפאל ומרת רחל דויטש', 5)).toBe(false)
  })

  // ⚠️ טבלה ריקה = תקלה ⇒ מאשר הכול, ולא צובע את כולם אדום.
  it('טבלה ריקה → מאשר הכול', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb([]))
    expect(inRef('כל שם', 3)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כינוי מאושר (15.10, סטפנסקי מאיר): בקובץ "רבי צבי יהודה קרויס", בעץ
// "רבי צבי הירש יהודה לייב ומרת מרים קרויס". הדור נצבע אדום והבורר הסתיר אותו.
// ─────────────────────────────────────────────────────────────────────────────
const KRAUS_FULL = 'רבי צבי הירש יהודה לייב ומרת מרים קרויס'
const KRAUS_REF = [
  { key: 'א', name: 'רבי משה בונים ופרומעט רחל קרויס', generation: 4, parent_key: null },
  { key: 'ב', name: 'רבי צבי יהודה קרויס', generation: 5, parent_key: 'א' },
]

describe('🔴 כינוי מאושר — צבי הירש יהודה לייב קרויס', () => {
  it('הצבע: השם המלא בעץ מתאים לשם שבקובץ (דור 5)', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb(KRAUS_REF))
    expect(inRef(KRAUS_FULL, 5)).toBe(true)
  })

  it('הבורר: השם המלא מוצע תחת האב הנכון', () => {
    const tree = buildApprovedRefTree(KRAUS_REF)
    expect(tree(KRAUS_FULL, 5, 'רבי משה בונים ופרומעט רחל קרויס')).toBe(true)
  })

  it('הכינוי לא מאחד אנשים אחרים: דור אחר / בן אחר באותו שם משפחה', async () => {
    invalidateApprovedRef()
    const inRef = await getApprovedRefLookup(fakeDb(KRAUS_REF))
    expect(inRef(KRAUS_FULL, 4)).toBe(false)
    expect(inRef('רבי צבי הירש ומרת מרים קרויס', 5)).toBe(false)
  })
})
