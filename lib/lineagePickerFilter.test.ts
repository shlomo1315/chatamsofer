import { describe, it, expect } from 'vitest'
import { pickableNodes } from './lineageApprovedColor'
import { buildApprovedRefTree } from './lineageApprovedRef'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבורר (אתר + טופס נדרים) מציג רק את מה שנצבע ירוק.
//
// ⚠️ הבאג (11.10): בדור 3 תחת הכתב סופר הוצגו 23 שמות, מתוכם 14 בדור שגוי
// (ענף פריי, ברנפלד, גולדגלנץ — נכדים ונינים שהוצגו כבנים) ו-3 שאינם בקובץ
// המאושר כלל. כולם נשאו status='verified', והבורר סינן לפי התווית בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const REF = new Set([
  'רבי משה ורבקה סופר|3',
  'מרת רויזא גולדשטיין|5',
  'רבי יצחק צבי ורויזא פריי|3',
])
const inRef = (name: string, gen: number) => REF.has(`${name}|${gen}`)

const n = (name: string, generation: number, status = 'verified') => ({ id: name, name, generation, status })

describe('pickableNodes', () => {
  it('דור 3: מסנן שם שבקובץ נמצא בדור 5 (נכד שהוצג כבן)', () => {
    const out = pickableNodes([n('רבי משה ורבקה סופר', 3), n('מרת רויזא גולדשטיין', 3)], inRef)
    expect(out.map(x => x.name)).toEqual(['רבי משה ורבקה סופר'])
  })

  it('דור 3: מסנן שם שאינו בקובץ כלל', () => {
    expect(pickableNodes([n('רבי אליעזר שרייבר', 3)], inRef)).toEqual([])
  })

  it('pending לעולם אינו מוצג — גם אם הוא בקובץ', () => {
    expect(pickableNodes([n('רבי יצחק צבי ורויזא פריי', 3, 'pending')], inRef)).toEqual([])
  })

  it('דור 1 (השורש) עובר תמיד', () => {
    expect(pickableNodes([n('מרן החתם סופר זי״ע', 1)], inRef)).toHaveLength(1)
  })

  it('מעל דור 5 — התווית מכריעה (אין קובץ להשוות מולו)', () => {
    expect(pickableNodes([n('רבי כלשהו', 6), n('רבי אחר', 7, 'pending')], inRef).map(x => x.name)).toEqual(['רבי כלשהו'])
  })
})

describe('buildApprovedRefTree — שם + דור + הורה', () => {
  const rows = [
    { key: 'החתם סופר', name: 'החתם סופר', generation: 1, parent_key: null },
    { key: 'כתב', name: 'רבי אברהם שמואל בנימין בעל הכתב סופר', generation: 2, parent_key: 'החתם סופר' },
    { key: 'צבי', name: 'רבי צבי יהודה ורעכיל פרידמן', generation: 2, parent_key: 'החתם סופר' },
    { key: 'חנוך', name: 'רבי אברהם חנוך וחנה חייטשא פרידמן', generation: 3, parent_key: 'צבי' },
    { key: 'דויטש', name: 'רבי רפאל ורחל דויטש', generation: 3, parent_key: 'כתב' },
  ]
  const approved = buildApprovedRefTree(rows)

  it('שם ודור נכונים אך תחת הורה אחר — לא מאושר', () => {
    expect(approved('רבי אברהם חנוך וחנה חייטשא פרידמן', 3, 'רבי אברהם שמואל בנימין בעל הכתב סופר')).toBe(false)
  })
  it('תחת ההורה הנכון — מאושר', () => {
    expect(approved('רבי אברהם חנוך וחנה חייטשא פרידמן', 3, 'רבי צבי יהודה ורעכיל פרידמן')).toBe(true)
  })
  it('"ומרת" מול "ו" — אותו אדם, גם בשם ההורה', () => {
    expect(approved('רבי רפאל ומרת רחל דויטש', 3, 'רבי אברהם שמואל בנימין בעל הכתב סופר')).toBe(true)
  })
  it('דור 2 — ההורה הוא השורש; שמו בעץ שונה מהקובץ ואינו נבדק', () => {
    expect(approved('רבי צבי יהודה ורעכיל פרידמן', 2, 'מרן החתם סופר זי״ע')).toBe(true)
  })
  it('דור שגוי — לא מאושר', () => {
    expect(approved('רבי רפאל ורחל דויטש', 4, 'רבי אברהם שמואל בנימין בעל הכתב סופר')).toBe(false)
  })
})
