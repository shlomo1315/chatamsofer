import { describe, it, expect } from 'vitest'
import { genColorByRef, isInApprovedRef } from './lineageApprovedColor'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הכלל שסוכם: עד דור 5 — מי שבטבלה המאושרת ירוק, וכל השאר אדום.
//
// ⚠️ עד היום הצבע נקבע לפי *התווית* (status='verified') שהודבקה על הצומת,
// ולא לפי הקובץ המאושר. lineage_approved_ref יושבת במסד מאז 25.08 ומעולם
// לא נקראה מהקוד — ולכן 51 צמתים שסומנו ידנית נצבעו ירוק אף שאינם בקובץ.
//
// ⚠️ המקרה שחשף: "רבי יהושע צבי גולדגלנץ" — בעץ דור 3 כבן של הכתב סופר,
// בקובץ דור 5 דרך דויטש. נין שהוצג כבן, בירוק.
//
// 🔴 ההשוואה כוללת את *הדור*: אותו שם בדור אחר הוא ייחוס שגוי, לא התאמה.
// ─────────────────────────────────────────────────────────────────────────────

/** הקובץ המאושר — מדגם מייצג מתוך 233 השורות. */
const REF = new Set([
  'מרן החתם סופר|1',
  'רבי אברהם שמואל בנימין בעל הכתב סופר|2',
  'רבי צבי יהודה ורעכיל פרידמן|2',
  'רבי יצחק צבי ורויזא פריי|3',
  'רבי יהודה והינדל רוזנבוים|4',
  'רבי יהושע צבי גולדגלנץ|5',
])
const inRef = (name: string, gen: number) => REF.has(`${name}|${gen}`)

describe('🔴 isInApprovedRef — התאמה לפי שם *ודור*', () => {
  it('שם ודור תואמים', () => {
    expect(isInApprovedRef('רבי יהודה והינדל רוזנבוים', 4, inRef)).toBe(true)
  })

  // 🔴 המקרה של גולדגלנץ ורוזנבוים בפועל.
  it('🔴 אותו שם בדור אחר — אינו התאמה', () => {
    expect(isInApprovedRef('רבי יהושע צבי גולדגלנץ', 3, inRef)).toBe(false)
    expect(isInApprovedRef('רבי יהודה והינדל רוזנבוים', 3, inRef)).toBe(false)
  })

  it('שם שאינו בקובץ כלל', () => {
    expect(isInApprovedRef('רבי אליעזר שרייבר', 3, inRef)).toBe(false)
  })
})

describe('🔴 genColorByRef — הצבע נקבע מהקובץ ולא מהתווית', () => {
  it('דור 1 — השורש, תמיד ירוק', () => {
    expect(genColorByRef(1, 'מרן החתם סופר', 'pending', inRef)).toBe('green')
  })

  it('בקובץ המאושר → ירוק', () => {
    expect(genColorByRef(2, 'רבי צבי יהודה ורעכיל פרידמן', 'verified', inRef)).toBe('green')
  })

  // 🔴 הלב: התווית אומרת "מאושר", הקובץ אומר שלא — הקובץ מכריע.
  it('🔴 גולדגלנץ: verified בעץ אך דור שגוי → אדום', () => {
    expect(genColorByRef(3, 'רבי יהושע צבי גולדגלנץ', 'verified', inRef)).toBe('red')
  })

  it('🔴 רוזנבוים: verified בעץ אך דור שגוי → אדום', () => {
    expect(genColorByRef(3, 'רבי יהודה והינדל רוזנבוים', 'verified', inRef)).toBe('red')
  })

  it('אינו בקובץ כלל, בתוך 5 הדורות → אדום', () => {
    expect(genColorByRef(3, 'רבי אליעזר שרייבר', 'verified', inRef)).toBe('red')
  })

  // ⚠️ מעל דור 5 הנרשם מוסיף את אבותיו בעצמו — זה המצב הרגיל ואינו חריגה.
  it('דור 6 שאינו בקובץ → כתום ולא אדום', () => {
    expect(genColorByRef(6, 'רבי חנניה בלייכברד', 'pending', inRef)).toBe('orange')
  })

  it('דור 7 מאומת ידנית → ירוק', () => {
    expect(genColorByRef(7, 'מישהו', 'verified', inRef)).toBe('green')
  })

  // 🔴 rejected אדום בכל דור — החלטה מפורשת לדחות.
  it('🔴 rejected → אדום גם מעל דור 5', () => {
    expect(genColorByRef(8, 'מישהו', 'rejected', inRef)).toBe('red')
  })

  it('דור 5 בקובץ → ירוק גם אם התווית pending', () => {
    expect(genColorByRef(5, 'רבי יהושע צבי גולדגלנץ', 'pending', inRef)).toBe('green')
  })

  // ⚠️ שם ריק אינו מפיל ואינו נצבע ירוק בטעות.
  it('שם ריק בתוך 5 הדורות → אדום', () => {
    expect(genColorByRef(3, '', 'verified', inRef)).toBe('red')
  })
})
