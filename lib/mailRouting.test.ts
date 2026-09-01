import { describe, it, expect } from 'vitest'
import { resolveMailbox, resolveAllMailboxes } from './mailRouting'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מייל שהופנה לכמה אגפים בבת אחת.
//
// הבאג: מי ששלח ל-office@ ול-igud@ יחד קיבל את מענה האופיס *פעמיים*,
// ואיגוד לא ענה כלל. Google שולח שני עותקים (dual-delivery), שניהם
// נושאים את אותה רשימת נמענים, ו-resolveMailbox מחזיר תמיד את הראשונה
// מביניהן — כלומר שני העותקים נפתרו לאותה תיבה.
// ─────────────────────────────────────────────────────────────────────────────
describe('כל התיבות שהמייל הופנה אליהן', () => {
  it('שני אגפים בשורת הנמענים — שניהם מוחזרים', () => {
    const boxes = resolveAllMailboxes({
      direct: ['office@chasamsofer.info', 'igud@chasamsofer.info'],
    })
    expect(boxes).toEqual(['office@chasamsofer.info', 'igud@chasamsofer.info'])
  })

  it('אותה תיבה פעמיים — פעם אחת בלבד', () => {
    // ⚠️ אחרת אותו מענה נשלח פעמיים על עותק אחד.
    const boxes = resolveAllMailboxes({
      direct: ['office@chasamsofer.info', 'OFFICE@chasamsofer.info'],
      cc: ['office@chasamsofer.info'],
    })
    expect(boxes).toHaveLength(1)
  })

  it('ישירים לפני Cc', () => {
    const boxes = resolveAllMailboxes({
      direct: ['g@chasamsofer.info'],
      cc: ['office@chasamsofer.info'],
    })
    expect(boxes[0]).toBe('g@chasamsofer.info')
    expect(boxes).toContain('office@chasamsofer.info')
  })

  it('כתובות שאינן תיבות מוכרות מושמטות', () => {
    const boxes = resolveAllMailboxes({
      direct: ['copy@in.chasamsofer.info', 'someone@gmail.com', 'y@chasamsofer.info'],
    })
    expect(boxes).toEqual(['y@chasamsofer.info'])
  })

  it('בלי אף תיבה מוכרת — רשימה ריקה', () => {
    // ⚠️ הקורא נופל-לאחור ל-resolveMailbox, שתמיד מחזיר יעד כלשהו.
    expect(resolveAllMailboxes({ direct: ['copy@in.chasamsofer.info'] })).toEqual([])
  })

  it('התיבה של resolveMailbox תמיד ברשימה', () => {
    // ⚠️ עקביות בין השתיים: ההודעה נשמרת באחת, והמענה יוצא מכולן —
    // אבל זו שבה היא נשמרה חייבת להיות ביניהן.
    const input = { direct: ['10@chasamsofer.info'], cc: ['office@chasamsofer.info'] }
    expect(resolveAllMailboxes(input)).toContain(resolveMailbox(input))
  })
})

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תיבה שהמנהל הוסיף לא זוהתה כתיבה מוכרת.
//
// מייל ל-m@chasamsofer.info נפל לכלל "הגיע דרך ה-copy" ונענה מ-office@.
// הפונה שלח לתיבה אחת וקיבל מענה מאחרת, עם נוסח של אגף שאין לו קשר
// לפנייתו — ואיש לא ידע, כי מבחינת המערכת הכל עבד.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 תיבות מותאמות', () => {
  const custom = ['m@chasamsofer.info']

  it('🔴 תיבה מותאמת נבחרת ולא נופלת ל-office', () => {
    expect(resolveMailbox({
      direct: ['m@chasamsofer.info'],
      customEmails: custom,
    })).toBe('m@chasamsofer.info')
  })

  it('🔴 גם כשהמייל הגיע דרך כתובת ה-copy', () => {
    // ⚠️ זה בדיוק המסלול שנפל: Google עושה dual-delivery, והנמען
    // המקורי מופיע לצד כתובת ה-copy.
    expect(resolveMailbox({
      direct: ['m@chasamsofer.info', 'copy@in.chasamsofer.info'],
      customEmails: custom,
    })).toBe('m@chasamsofer.info')
  })

  it('⚠️ גם בלי הרשימה — כלל (3) תופס כתובת ארגונית', () => {
    // ⚠️ resolveMailbox עצמו *לא* היה הבאג: כלל (3) מחזיר כל כתובת
    // בדומיין שלנו. הבאג היה ב-departmentByEmail הסינכרוני, שנקרא
    // אחר כך כדי להחליט מאיזו מחלקה לענות.
    expect(resolveMailbox({
      direct: ['m@chasamsofer.info', 'copy@in.chasamsofer.info'],
    })).toBe('m@chasamsofer.info')
  })

  it('⚠️ מחלקה קבועה גוברת על תיבה מותאמת ב-Cc', () => {
    expect(resolveMailbox({
      direct: ['g@chasamsofer.info'],
      cc: ['m@chasamsofer.info'],
      customEmails: custom,
    })).toBe('g@chasamsofer.info')
  })

  it('⚠️ רישיות אינה משנה', () => {
    expect(resolveMailbox({
      direct: ['M@ChasamSofer.info'],
      customEmails: custom,
    })).toBe('M@ChasamSofer.info')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מייל שנשלח ל-c@ בלבד נענה ממשרד ראשי.
//
// office היא יעד ההעברה של שאר התיבות, ולכן היא נספחת ל-received_for
// כמעט תמיד — גם כשהפונה כתב לאגף אחד. הסדר שם שרירותי, וכשהיא הופיעה
// ראשונה היא בלעה את הפנייה. בפרודקשן:
//   received_for: [copy@in…, office@…, c@…] → resolved: office@
// ההגדרות של עזר לחגים היו תקינות לחלוטין; התיבה פשוט לא נבחרה.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 תיבה ייעודית גוברת על office', () => {
  it('c@ נבחרת גם כש-office מופיעה לפניה — המקרה מהפרודקשן', () => {
    expect(resolveMailbox({
      direct: ['copy@in.chasamsofer.info', 'office@chasamsofer.info', 'c@chasamsofer.info'],
    })).toBe('c@chasamsofer.info')
  })

  it('גם כשהייעודית אחרונה מבין כמה', () => {
    expect(resolveMailbox({
      direct: ['office@chasamsofer.info', 'y@chasamsofer.info'],
    })).toBe('y@chasamsofer.info')
  })

  it('office נבחרת כשהיא התיבה המוכרת היחידה', () => {
    expect(resolveMailbox({
      direct: ['copy@in.chasamsofer.info', 'office@chasamsofer.info'],
    })).toBe('office@chasamsofer.info')
  })

  it('ייעודית ב-Cc אינה גוברת על ייעודית בנמען ישיר', () => {
    expect(resolveMailbox({
      direct: ['g@chasamsofer.info'],
      cc: ['y@chasamsofer.info'],
    })).toBe('g@chasamsofer.info')
  })

  it('office ישירה נבחרת על פני ייעודית ב-Cc בלבד', () => {
    expect(resolveMailbox({
      direct: ['office@chasamsofer.info'],
      cc: ['c@chasamsofer.info'],
    })).toBe('office@chasamsofer.info')
  })
})
