import { describe, it, expect } from 'vitest'
import { normalizeHebrewName, parseHebrewName, compareHebrewNames } from './hebrewNames'

// ⚠️ הבדיקות בנויות סביב הנתונים האמיתיים מעץ הדורות. המקרה שהוביל לכל זה:
//     "רבי מרדכי ושרה שטרלינג"  מול  "ר' מרדכי צבי ושרה שטרלינג"
// אותו אדם, שני צאצאים שרשמו אותו, שני הבדלים באותו זוג.

describe('נרמול שם', () => {
  it('מסיר גרשיים ופיסוק', () => {
    expect(normalizeHebrewName("ר' מרדכי")).toBe('ר מרדכי')
    expect(normalizeHebrewName('רבי מרדכי ז"ל')).toBe('רבי מרדכי זל')
  })

  it('מאחד רווחים כפולים', () => {
    expect(normalizeHebrewName('  מרדכי   שטרלינג ')).toBe('מרדכי שטרלינג')
  })

  it('מאחד אותיות סופיות', () => {
    // רק לצורך השוואה — לא לתצוגה
    expect(normalizeHebrewName('אברהם')).toBe(normalizeHebrewName('אברהמ'))
  })
})

describe('פירוק שם למבנה', () => {
  it('מפריד תואר, שם, בת זוג ושם משפחה', () => {
    const p = parseHebrewName('רבי מרדכי ושרה שטרלינג')
    expect(p.given).toEqual(['מרדכי'])
    expect(p.spouse).toBe('שרה')
    expect(p.family).toBe('שטרלינג')
  })

  it('תופס שם אמצעי', () => {
    const p = parseHebrewName("ר' מרדכי צבי ושרה שטרלינג")
    expect(p.given).toEqual(['מרדכי', 'צבי'])
    expect(p.spouse).toBe('שרה')
    expect(p.family).toBe('שטרלינג')
  })

  it('מסיר סימני כבוד', () => {
    const p = parseHebrewName('הרב יעקב זצ"ל כהן')
    expect(p.given).toEqual(['יעקב'])
    // ⚠️ 'כהנ' ולא 'כהן' — ן' סופית מאוחדת ל-נ' לצורך השוואה בלבד. הערך הזה
    // אינו מוצג למשתמש; התצוגה תמיד מהשם המקורי.
    expect(p.family).toBe('כהנ')
    expect(p.family).toBe(parseHebrewName('כהן').given[0])
  })

  it('שם בודד — בלי שם משפחה', () => {
    // ⚠️ קריטי: אילו "יעקב" היה נחשב שם משפחה, כל שני אנשים בשם יעקב היו
    // מתאימים זה לזה והמערכת הייתה מציעה למזג אנשים זרים.
    const p = parseHebrewName('יעקב')
    expect(p.family).toBe('')
    expect(p.given).toEqual(['יעקב'])
  })
})

describe('השוואת שמות — הרמות', () => {
  it('זהים לחלוטין', () => {
    expect(compareHebrewNames('רבי צבי ואסתר אילני', 'רבי צבי ואסתר אילני').level).toBe('exact')
  })

  it('תואר שונה בלבד — נחשב זהה', () => {
    // "רבי" מול "ר'" — תואר אינו חלק מהזהות
    expect(compareHebrewNames('רבי מרדכי ושרה שטרלינג', "ר' מרדכי ושרה שטרלינג").level).toBe('exact')
  })

  it('המקרה האמיתי: שם אמצעי עודף → הצעה חזקה, לא אוטומטי', () => {
    const m = compareHebrewNames('רבי מרדכי ושרה שטרלינג', "ר' מרדכי צבי ושרה שטרלינג")
    expect(m.level).toBe('strong')
    expect(m.reason).toContain('צבי')
  })

  it('שם משפחה שונה — אין התאמה, גם אם השם הפרטי זהה', () => {
    // ⚠️ העוגן שמונע חיבור בין אנשים זרים
    expect(compareHebrewNames('רבי מרדכי ושרה שטרלינג', 'רבי מרדכי ורחל מנדלוביץ').level).toBe('none')
  })

  it('בת זוג שונה — אינו "חזק"', () => {
    const m = compareHebrewNames('רבי מרדכי ושרה שטרלינג', 'רבי מרדכי ולאה שטרלינג')
    expect(m.level).not.toBe('exact')
    expect(m.level).not.toBe('strong')
  })

  it('בת זוג צוינה רק באחד — הצעה חזקה', () => {
    expect(compareHebrewNames('רבי מרדכי שטרלינג', 'רבי מרדכי ושרה שטרלינג').level).toBe('strong')
  })

  it('כתיב מלא/חסר — אפשרי בלבד', () => {
    expect(compareHebrewNames('דוד כהן', 'דויד כהן').level).toBe('possible')
  })

  it('שם ריק אינו מתאים לכלום', () => {
    expect(compareHebrewNames('', 'רבי מרדכי שטרלינג').level).toBe('none')
    expect(compareHebrewNames('   ', '  ').level).toBe('none')
  })

  it('שני שמות פרטיים בלי שם משפחה — לא מתאימים אוטומטית', () => {
    // בלי עוגן שם משפחה אין די מידע כדי להציע מיזוג
    expect(compareHebrewNames('יעקב', 'יעקב').level).toBe('exact')   // זהים ממש
    expect(compareHebrewNames('יעקב', 'יעקב צבי').level).toBe('none') // אין עוגן
  })
})
