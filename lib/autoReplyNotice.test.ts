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

// ─────────────────────────────────────────────────────────────────────────────
// עריכת הכותרת והבלוק האדום פר-תיבה (נוסף לבקשת המשתמש).
// ─────────────────────────────────────────────────────────────────────────────
describe('כותרת והודעת "אין להשיב" ניתנות לעריכה פר-תיבה', () => {
  const base = () => defaultAutoReplyMap().main!

  it('ריק — ברירת המחדל', () => {
    const mail = renderAutoReply('main', base())
    expect(mail.html).toContain('ברוכים הבאים')
    expect(mail.html).toContain('אין להשיב')
  })

  it('כותרת מותאמת מחליפה את ברירת המחדל', () => {
    const mail = renderAutoReply('main', { ...base(), title: 'שלום וברכה' })
    expect(mail.html).toContain('שלום וברכה')
    expect(mail.html).not.toContain('ברוכים הבאים')
  })

  it('נוסח "אין להשיב" מותאם מחליף את ברירת המחדל', () => {
    const mail = renderAutoReply('main', { ...base(), noReplyNotice: 'נא לא להשיב\nהתיבה אינה מנוטרת' })
    expect(mail.html).toContain('נא לא להשיב')
    expect(mail.html).toContain('התיבה אינה מנוטרת')
    expect(countOf(mail.html, 'אינן נקראות')).toBe(0)
  })

  // 🔴 תיבה שכן קוראים בה תשובות — הבלוק כולו יורד.
  it('רווח בודד מסתיר את הבלוק לגמרי', () => {
    const mail = renderAutoReply('main', { ...base(), noReplyNotice: ' ' })
    expect(countOf(mail.html, 'אין להשיב')).toBe(0)
    expect(countOf(mail.html, 'ממערכת אוטומטית')).toBe(0)
  })

  // ⚠️ "אין להשיב" הוא מאפיין של התיבה, לא של הנוסח — הוא חייב לשרוד
  // גם במעבר להודעה הזמנית, שבה הכפתורים והסעיפים כן יורדים.
  it('ההתאמה נשמרת גם בנוסח הזמני', () => {
    const mail = renderAutoReply('main', {
      ...base(), mode: 'temp', tempMessage: 'נחזור אליכם', noReplyNotice: ' ',
    })
    expect(countOf(mail.html, 'אין להשיב')).toBe(0)
  })
})
