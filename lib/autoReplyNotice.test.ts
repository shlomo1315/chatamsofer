import { describe, it, expect } from 'vitest'
import { defaultAutoReplyMap } from './autoReplyConfig'
import { renderAutoReply } from './autoReplySender'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג: תחתית המייל הציגה שלוש הבהרות "אין להשיב" זו אחר זו, וכל אחת
// חזרה על כתובת המשרד — noReplyBox של התבנית, automatedNotice של מסלול
// Gmail, והכותרת התחתונה של shell.
//
// ⚠️ בדיקת הכפילות ב-withAutomatedNotice חיפשה "אין להשיב" בלבד, בעוד
// noReplyBox כותב "ואין להשיב אליו" — ולכן החמיצה אותו.
// ─────────────────────────────────────────────────────────────────────────────

/** מספר המופעים של ביטוי בטקסט. */
const countOf = (html: string, needle: string) => html.split(needle).length - 1

describe('הבהרת "אין להשיב" — פעם אחת בלבד', () => {
  const mail = renderAutoReply('main', defaultAutoReplyMap().main!)

  it('ההבהרה מופיעה פעם אחת', () => {
    expect(countOf(mail.html, 'אין להשיב')).toBe(1)
  })

  it('"אינן נקראות" מופיע פעם אחת', () => {
    expect(countOf(mail.html, 'אינן נקראות')).toBe(1)
  })

  it('"נשלח ממערכת אוטומטית" מופיע פעם אחת', () => {
    expect(countOf(mail.html, 'ממערכת אוטומטית')).toBe(1)
  })

  it('אין כתובת מייל בכותרת התחתונה של המעטפת', () => {
    // ⚠️ הכתובות שייכות לסעיפי ההפניה בגוף ההודעה. הכותרת התחתונה הציגה
    // את כתובת המשרד בכל מייל, גם כשההודעה הפנתה במפורש לאגף אחר.
    const footer = mail.html.slice(mail.html.indexOf('מערכת היכל החתם סופר'))
    expect(footer).not.toContain('mailto:')
  })
})

describe('גוף ההודעה — הכתובות נשמרות', () => {
  const mail = renderAutoReply('main', defaultAutoReplyMap().main!)

  it('כתובות האגפים שבסעיפים לא הוסרו', () => {
    // ⚠️ ההסרה נועדה לחזרות בתחתית בלבד. הקישורים שהמנהל הגדיר בסעיפים
    // הם תוכן המייל עצמו.
    expect(mail.html).toContain('igud@chasamsofer.info')
    expect(mail.html).toContain('10@chasamsofer.info')
  })
})
