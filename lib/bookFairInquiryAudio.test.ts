import { describe, it, expect } from 'vitest'
import { pickInquiryFile, timestampOf, inquiryStorageKey } from './bookFairInquiryAudio'

// שמות אמיתיים מסל המיחזור של ימות (סריקת 05.10).
const AT = 1791144139

describe('timestampOf', () => {
  it('ApiRecord — החותמת בסוף', () => {
    expect(timestampOf('Phone-0583273227-id---1791144139.wav')).toBe(1791144139)
  })
  it('ApiVoice — החותמת בתחילה', () => {
    expect(timestampOf('1791146389-DID-093130924-Phone-0548495636-Folder-9-in.wav')).toBe(1791146389)
  })
  it('⚠️ מספר טלפון אינו חותמת', () => {
    expect(timestampOf('Phone-0583273227.wav')).toBeNull()
  })
})

describe('pickInquiryFile', () => {
  const names = [
    'Phone-0583273227-id---1791144000.wav',        // אותו מתקשר, 2 דק' קודם (הקלטת שם בהזמנה)
    'Phone-0583273227-id---1791144130.wav',        // 🎯 הפנייה
    'Phone-0548495636-id---1791144139.wav',        // מתקשר אחר, אותה שנייה
    'Phone-0583273227-id---1791160000.wav',        // אותו מתקשר, 4 שעות אחר כך
  ]

  it('הקובץ של אותו טלפון הקרוב ביותר לרגע הרישום', () => {
    expect(pickInquiryFile(names, '0583273227', AT)).toBe('Phone-0583273227-id---1791144130.wav')
  })

  // 🔴 בלי הבדיקה הזו — הפנייה הייתה מתנגנת עם קול של מתקשר אחר
  it('לעולם לא של טלפון אחר, גם אם הזמן זהה', () => {
    expect(pickInquiryFile(['Phone-0548495636-id---1791144139.wav'], '0583273227', AT)).toBeNull()
  })

  it('מחוץ לטווח של 10 דקות — אין התאמה', () => {
    expect(pickInquiryFile(['Phone-0583273227-id---1791160000.wav'], '0583273227', AT)).toBeNull()
  })

  it('טלפון חסר ("לא ידוע") — אין התאמה', () => {
    expect(pickInquiryFile(names, 'לא ידוע', AT)).toBeNull()
  })
})

describe('inquiryStorageKey', () => {
  it('מנקה תווים שאינם בטוחים לנתיב', () => {
    expect(inquiryStorageKey('abc/../x')).toBe('book-fair/inquiries/abc_.._x.wav')
  })
})
