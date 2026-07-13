import { describe, it, expect } from 'vitest'
import { resolveMailbox } from './mailRouting'

// הבאג שהתגלה בפרודקשן: מיילים שנשלחו לתיבה 10 הופיעו בתיבת office,
// ומשתמשים ראו דואר של מחלקה אחרת.

describe('הבאג: דואר של מחלקה אחת הופיע אצל אחרת', () => {
  it('מייל לתיבה 10 עם office ב-Cc — נשאר בתיבה 10', () => {
    const box = resolveMailbox({
      direct: ['10@chasamsofer.info'],
      cc: ['office@chasamsofer.info'],
    })
    expect(box).toBe('10@chasamsofer.info')
  })

  it('office נשרך משרשור תגובות — לא חוטף את המייל', () => {
    // Reply-All בשרשור ישן מכניס את office ל-Cc לנצח.
    const box = resolveMailbox({
      direct: ['g@chasamsofer.info'],
      cc: ['office@chasamsofer.info', 'igud@chasamsofer.info'],
    })
    expect(box).toBe('g@chasamsofer.info')
  })

  it('Delivered-To גובר על To — הנמען בפועל הוא הקובע', () => {
    // ב-dual-delivery ה-To עלול להיות כתובת ישנה/רשימת תפוצה.
    const box = resolveMailbox({
      direct: ['y@chasamsofer.info', 'office@chasamsofer.info'],
    })
    expect(box).toBe('y@chasamsofer.info')
  })

  it('תיבה ב-Cc בלבד, בלי אף נמען ישיר מוכר — כן משמשת', () => {
    // אחרת המייל היה נופל ל-office ומאבד את השיוך לגמרי.
    const box = resolveMailbox({
      direct: ['copy@in.chasamsofer.info'],
      cc: ['a@chasamsofer.info'],
    })
    expect(box).toBe('a@chasamsofer.info')
  })
})

describe('ניתוב בקשות', () => {
  it('בקשה שהגיעה דרך כתובת ה-copy — לאיגוד', () => {
    const box = resolveMailbox({
      direct: ['copy@in.chasamsofer.info'],
      isRequest: true,
    })
    expect(box).toBe('igud@chasamsofer.info')
  })

  it('בקשה שנשלחה לתיבה מוכרת — התיבה גוברת', () => {
    // אם המשתמש שלח במפורש לתיבה, מכבדים אותה.
    const box = resolveMailbox({
      direct: ['g@chasamsofer.info'],
      isRequest: true,
    })
    expect(box).toBe('g@chasamsofer.info')
  })
})

describe('נפילות-לאחור', () => {
  it('כתובת ארגונית שטרם הוגדרה כתיבה — נשמרת תחת עצמה', () => {
    const box = resolveMailbox({ direct: ['newbox@chasamsofer.info'] })
    expect(box).toBe('newbox@chasamsofer.info')
  })

  it('רק כתובת copy, בלי נמען מקורי — משרד ראשי', () => {
    const box = resolveMailbox({ direct: ['copy@in.chasamsofer.info'] })
    expect(box).toBe('office@chasamsofer.info')
  })

  it('שום דבר מזוהה — ה-envelope', () => {
    const box = resolveMailbox({ direct: [], envelopeTo: 'x@other.com' })
    expect(box).toBe('x@other.com')
  })
})
