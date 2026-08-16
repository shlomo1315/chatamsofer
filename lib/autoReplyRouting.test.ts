import { describe, it, expect } from 'vitest'
import { shouldSendGenericReply, DEDICATED_REPLY_DEPARTMENTS } from './autoReplyRouting'

// ─────────────────────────────────────────────────────────────────────────────
// מייל ההטבות של igud מעולם לא נשלח, אף שהמנגנון היה קיים.
//
// השורש: שני מענים רצו ברצף על אותו מייל נכנס — המענה הייעודי (הטבות)
// ואחריו הגנרי ("קיבלנו את פנייתכם"). הגנרי רץ אחרון ונרשם
// ל-auto_reply_log, ובכך אכל את תקרת המענים השבועית — כך שהמענה
// הייעודי נחסם ב-underAutoReplyCap בפנייה הבאה.
//
// העדות: כל שורה ב-auto_reply_log נושאת את הנושא "קיבלנו את פנייתכם".
// אף אחת אינה מייל ההטבות.
//
// ⚠️ וגם בלי התקרה זה היה שגוי: הפונה קיבל שני מיילים על פנייה אחת —
// אחד עם הפרטים והקישורים, ומיד אחריו "נשוב אליכם בהקדם".
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldSendGenericReply', () => {
  it('🔴 הרגרסיה: תיבה עם מענה ייעודי אינה מקבלת גם מענה גנרי', () => {
    expect(shouldSendGenericReply('igud')).toBe(false)
    expect(shouldSendGenericReply('gemach')).toBe(false)
  })

  it('תיבות ללא מענה ייעודי כן מקבלות את הגנרי', () => {
    expect(shouldSendGenericReply('main')).toBe(true)
    expect(shouldSendGenericReply('maternity')).toBe(true)
    expect(shouldSendGenericReply('widows')).toBe(true)
  })

  it('תיבה לא ידועה — נשלח הגנרי', () => {
    // ⚠️ ברירת המחדל מתירה: תיבה חדשה שאין לה מענה ייעודי צריכה
    // לענות משהו, ולא לשתוק.
    expect(shouldSendGenericReply(null)).toBe(true)
    expect(shouldSendGenericReply('inbox42')).toBe(true)
  })

  it('כל תיבה ברשימה הייעודית באמת מוחרגת', () => {
    for (const d of DEDICATED_REPLY_DEPARTMENTS) {
      expect(shouldSendGenericReply(d)).toBe(false)
    }
  })
})
