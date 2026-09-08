import { describe, it, expect } from 'vitest'
import { spokenCenterName, spokenCenterDetails } from './holidayCenterSpeech'

describe('spokenCenterName', () => {
  it('מפריד עיר ושם בפסיק — לא ב-"·" שנועד למסך', () => {
    expect(spokenCenterName({ city: 'ירושלים', name: 'אזור מאה שערים' }))
      .toBe('ירושלים, אזור מאה שערים')
  })

  it('עיר ששמה זהה לשם המוקד אינה נאמרת פעמיים', () => {
    expect(spokenCenterName({ city: 'אשדוד', name: 'אשדוד' })).toBe('אשדוד')
  })

  it('נופל לשם או לעיר כשאחד מהם חסר', () => {
    expect(spokenCenterName({ city: 'טבריה', name: null })).toBe('טבריה')
    expect(spokenCenterName({ city: null, name: 'רכסים' })).toBe('רכסים')
  })

  it('מוקד ריק מחזיר מחרוזת ריקה ולא "null"', () => {
    expect(spokenCenterName(null)).toBe('')
    expect(spokenCenterName({})).toBe('')
  })
})

describe('spokenCenterDetails — לאן ללכת ומתי', () => {
  it('אומר שם, כתובת ושעות', () => {
    expect(spokenCenterDetails({
      city: 'בני ברק', name: 'אזור ויז׳ניץ',
      address: 'רחוב אהבת שלום 5', hours: 'א׳–ה׳ 10:00–14:00',
    })).toBe('בני ברק, אזור ויז׳ניץ. הכתובת: רחוב אהבת שלום 5. שעות הפתיחה: א׳–ה׳ 10:00–14:00')
  })

  it('⚠️ מדלג על חלק חסר במקום להשאיר חור במשפט', () => {
    expect(spokenCenterDetails({ city: 'טבריה', name: 'טבריה', hours: 'ב׳ 9:00–13:00' }))
      .toBe('טבריה. שעות הפתיחה: ב׳ 9:00–13:00')
    expect(spokenCenterDetails({ city: 'רכסים', name: 'רכסים', address: 'הרצל 1' }))
      .toBe('רכסים. הכתובת: הרצל 1')
  })

  it('מוקד בלי כתובת ושעות — רק השם, בלי סימני פיסוק תלושים', () => {
    expect(spokenCenterDetails({ city: 'צפת', name: 'צפת' })).toBe('צפת')
  })

  it('מתעלם משדות שהם רווחים בלבד', () => {
    expect(spokenCenterDetails({ city: 'חיפה', name: 'חיפה', address: '   ', hours: '' }))
      .toBe('חיפה')
  })
})
