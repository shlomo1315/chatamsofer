import { describe, it, expect } from 'vitest'
import { holidayFamilyName, holidayFirstNames } from './holidayFamilyName'

describe('שם המשפחה בהודעות חלוקת חגים', () => {
  it('נשואים: משפחה, שם הבעל ושם האשה', () => {
    const b = { family_name: 'פרנקל', full_name: 'מנחם מענדיל', spouse_name: 'פייגא', marital_status: 'נשואים' }
    expect(holidayFamilyName(b)).toBe('פרנקל מנחם מענדיל ופייגא')
    expect(holidayFirstNames(b)).toBe('מנחם מענדיל ופייגא')
  })

  it('נשוי בלי מצב משפחתי ברשומה: שני השמות', () => {
    expect(holidayFamilyName({ family_name: 'פרנקל', full_name: 'מנחם מענדיל', spouse_name: 'פייגא' }))
      .toBe('פרנקל מנחם מענדיל ופייגא')
  })

  it('לא נשואים: השם הפרטי בלבד, כמו קודם', () => {
    expect(holidayFamilyName({ family_name: 'כהן', full_name: 'חיה', marital_status: 'אלמנה' })).toBe('כהן חיה')
    // שם בן זוג שנשאר ברשומה של גרוש לא מצורף
    expect(holidayFamilyName({ family_name: 'לוי', full_name: 'יוסף', spouse_name: 'רחל', marital_status: 'גרוש' })).toBe('לוי יוסף')
  })

  it('נשואים שחסר בהם שם אחד: השם שקיים', () => {
    expect(holidayFamilyName({ family_name: 'פרנקל', spouse_name: 'פייגא', marital_status: 'נשואים' })).toBe('פרנקל')
    expect(holidayFamilyName({ family_name: 'פרנקל', full_name: 'מנחם מענדיל', marital_status: 'נשואים' })).toBe('פרנקל מנחם מענדיל')
  })

  it('רשומה ריקה: מחרוזת ריקה', () => {
    expect(holidayFamilyName(null)).toBe('')
  })
})
