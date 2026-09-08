import { describe, it, expect } from 'vitest'
import { HOLIDAY_MESSAGE_META } from './yemotHolidayMessages'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הפתיח של מקש 2 חייב להישמע בקול טבעי — כמו פרטי המוקד שאחריו.
//
// ⚠️ הודעה שמכילה {משתנה} אינה כשירה להקלטה: קובץ אחד אינו יכול לשרת 26
// מוקדים שונים, ולכן generate-voice חוסם אותה (eligible/hasPlaceholder).
// כל עוד שם המוקד היה בתוך הנוסח, הפתיח נשאר ב-TTS הרובוטי של ימות בזמן
// שפרטי המוקד — שנאמרים מיד אחריו — נשמעו בקול נוירוני. שיחה אחת בשני
// קולות שונים נשמעת כתקלה.
//
// 🔴 הפתרון: שם המוקד יוצא מהפתיח ונאמר רק בהקלטת המוקד, שבאה מיד אחריו.
// שום מידע אינו אובד — הוא פשוט נאמר פעם אחת, במקום שבו הוא ממילא מוקלט.
// ─────────────────────────────────────────────────────────────────────────────

const meta = (key: string) => HOLIDAY_MESSAGE_META.find(m => m.key === key)
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

describe('🔴 הודעות מקש 2 כשירות לקול טבעי', () => {
  for (const key of ['card_ready', 'center_already']) {
    it(`${key} — בלי {משתנה}, אחרת יצירת הקול חסומה`, () => {
      const m = meta(key)
      expect(m).toBeDefined()
      expect(hasPlaceholder(m!.defaultText)).toBe(false)
    })

    it(`${key} — מסומן allowAudio`, () => {
      expect(meta(key)!.allowAudio).toBe(true)
    })

    it(`${key} — אינו מצהיר על placeholders`, () => {
      expect(meta(key)!.placeholders ?? []).toEqual([])
    })
  }

  // ⚠️ המידע לא נעלם: שם המוקד עדיין נאמר — בהקלטת המוקד שמושמעת
  // מיד אחרי הפתיח. הטסט הזה מגן על כך שלא נוריד גם את ההפניה אליו.
  it('הפתיח מפנה לפרטי המוקד שנאמרים אחריו', () => {
    expect(meta('card_ready')!.defaultText).toContain('להלן פרטי המוקד')
  })
})
