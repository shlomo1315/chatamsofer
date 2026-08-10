import { describe, it, expect } from 'vitest'
import {
  composeLineageName, stripTitles, findTitles, normalizeLineageNodeName, alreadyFormatted,
  normalizeWifeTitle,
} from './lineageNameFormat'

// ⚠️ הבעיה שזה פותר: בשדה שם חופשי כל נרשם כתב אחרת — "רבי", "ר'", "הרב",
// ועם "שליט\"א" בסוף — ואותו אדם נכנס לעץ בכמה ניסוחים שנראים כמו אנשים
// שונים. כאן מזינים שמות בלבד והמערכת מרכיבה ניסוח אחיד.

describe('הרכבת השם האחיד', () => {
  it('בעל ואישה', () => {
    expect(composeLineageName({ husband: 'משה', wife: 'חיה', family: 'כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
  })

  it('בלי אישה — אין "ומרת"', () => {
    // ⚠️ יש דורות בעץ שהאישה בהם אינה ידועה. חיוב שם אישה היה מכריח המצאה.
    expect(composeLineageName({ husband: 'אשר שמואל', family: 'פנעט' }))
      .toBe('רבי אשר שמואל פנעט')
  })

  it('שם כפול נשמר', () => {
    expect(composeLineageName({ husband: 'יוסף חיים', wife: 'רחל לאה', family: 'לוי' }))
      .toBe('רבי יוסף חיים ומרת רחל לאה לוי')
  })

  it('תארים שהוזנו בטעות מנוקים', () => {
    expect(composeLineageName({ husband: "ר' משה", wife: 'מרת חיה', family: 'כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
    expect(composeLineageName({ husband: 'הרב משה שליט"א', wife: 'חיה תחי\'', family: 'כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
  })
})

describe('ניקוי תארים', () => {
  it('מסיר תואר מלפנים וסיומת מאחור', () => {
    expect(stripTitles('הרב משה שליט"א')).toBe('משה')
    expect(stripTitles("ר' יעקב ז\"ל")).toBe('יעקב')
    expect(stripTitles('הרבנית חיה ע"ה')).toBe('חיה')
  })

  it('אינו נוגע בשם נקי', () => {
    expect(stripTitles('משה')).toBe('משה')
    expect(stripTitles('יוסף חיים')).toBe('יוסף חיים')
  })

  it('שם שכולו תואר אינו מתרוקן לאמצע השם', () => {
    // "רב" הוא גם תואר וגם תחילת שמות; הבדיקה שההסרה עוצרת ולא אוכלת הכל
    expect(stripTitles('רבי')).toBe('')
  })
})

describe('זיהוי תארים להודעה למשתמש', () => {
  it('מדווח מה הוזן בטעות', () => {
    // ⚠️ ההודעה למשתמש חשובה: ניקוי שקט לא היה מלמד אותו את הכלל, והוא היה
    // ממשיך להזין תארים בכל דור.
    expect(findTitles('הרב משה')).toContain('הרב')
    expect(findTitles('משה שליט"א')).toContain('שליט"א')
    expect(findTitles('משה')).toEqual([])
  })
})

describe('נרמול בשרת (רישום ציבורי + נדרים פלוס)', () => {
  it('שדות מופרדים', () => {
    expect(normalizeLineageNodeName({ husband: 'משה', wife: 'חיה', family: 'כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
  })

  it('שם חופשי מפורק ומורכב מחדש', () => {
    // ⚠️ טופס נדרים פלוס חיצוני — אי אפשר לסמוך על ולידציה בצד הלקוח שלו
    expect(normalizeLineageNodeName({ name: 'משה וחיה כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
    expect(normalizeLineageNodeName({ name: "ר' משה וחיה כהן שליט\"א" }))
      .toBe('רבי משה ומרת חיה כהן')
  })

  it('שם שכבר בפורמט אינו מקבל תואר כפול', () => {
    expect(normalizeLineageNodeName({ name: 'רבי משה ומרת חיה כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
    expect(alreadyFormatted('רבי משה כהן')).toBe(true)
  })

  it('"והרבנית" בשם מנוסח מומר ל"ומרת"', () => {
    // ⚠️ שם מנוסח עוקף את ההרכבה, ולכן התואר הישן היה נכנס לעץ גם אחרי
    // המיגרציה שהמירה את כל השאר — ואותו אדם היה מופיע בשני ניסוחים.
    expect(normalizeLineageNodeName({ name: 'רבי משה והרבנית חיה כהן' }))
      .toBe('רבי משה ומרת חיה כהן')
  })

  it('שם משפחה שמכיל "הרבנית" אינו נפגע', () => {
    // ההחלפה דורשת רווחים משני הצדדים ואת ו' החיבור, ולכן אינה נוגעת בשם
    // שמתחיל במילה או במופע שאינו תואר האישה.
    expect(normalizeWifeTitle('הרבנית חיה כהן')).toBe('הרבנית חיה כהן')
    expect(normalizeWifeTitle('רבי משה ומרת חיה כהן')).toBe('רבי משה ומרת חיה כהן')
  })

  it('שם בודד מוחזר כמות שהוא ולא הופך ל"רבי" ריק', () => {
    expect(normalizeLineageNodeName({ name: 'יעקב' })).toBe('יעקב')
  })

  it('ריק מחזיר ריק', () => {
    expect(normalizeLineageNodeName({ name: '  ' })).toBe('')
    expect(normalizeLineageNodeName(null)).toBe('')
  })
})
