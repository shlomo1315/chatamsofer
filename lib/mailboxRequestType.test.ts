import { describe, it, expect } from 'vitest'
import { detectReqTypeForMailbox, MAILBOX_REQUEST_TYPE } from './emailRequestForms'
import { isRequestMailFor, effectiveRequestSubject, isRequestSubject } from './emailRequestIntake'

// ─────────────────────────────────────────────────────────────────────────────
// הגשה לתיבת אגף עם ת"ז בלבד בשורת הנושא.
//
// עד כה כל ההגשות הופנו ל-igud@, והנושא היה הדבר היחיד שקבע את הסוג —
// שורת נושא שהשתנתה קצת הפילה את הקליטה בשקט.
//
// 🔴 הסיכון שהבדיקות כאן נועלות: מייל שהקליטה מזהה כבקשה אך המענה
// האוטומטי לא (או להפך). התוצאה הייתה שני מיילים סותרים על פנייה אחת —
// אישור קליטה ומיד אחריו "פנייתכם התקבלה" הגנרי.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ ת"ז תקינה לפי ספרת ביקורת — הבדיקה דורשת תקינות, לא רק 9 ספרות.
const VALID_ID = '039272315'
const INVALID_ID = '123456780'

describe('זיהוי לפי התיבה', () => {
  it('הלוואות — ת"ז בלבד בנושא', () => {
    expect(detectReqTypeForMailbox(VALID_ID, 'g@chasamsofer.info')).toBe('loan')
  })

  it('יולדות — ת"ז בלבד בנושא', () => {
    expect(detectReqTypeForMailbox(VALID_ID, 'y@chasamsofer.info')).toBe('birth')
  })

  it('סיוע רפואי ואלמנות', () => {
    expect(detectReqTypeForMailbox(VALID_ID, 'r@chasamsofer.info')).toBe('financial_aid')
    expect(detectReqTypeForMailbox(VALID_ID, 'a@chasamsofer.info')).toBe('widow')
  })

  it('ת"ז עם מלל נוסף — עדיין נקלט', () => {
    expect(detectReqTypeForMailbox(`בקשה ${VALID_ID}`, 'g@chasamsofer.info')).toBe('loan')
  })

  // 🔴 ההגנה המרכזית: שאלה רגילה לתיבת אגף אינה בקשה.
  it('שאלה בלי ת"ז אינה בקשה', () => {
    expect(detectReqTypeForMailbox('מה קורה עם ההלוואה שלי?', 'g@chasamsofer.info')).toBeNull()
  })

  it('ת"ז לא תקינה (ספרת ביקורת שגויה) אינה בקשה', () => {
    expect(detectReqTypeForMailbox(INVALID_ID, 'g@chasamsofer.info')).toBeNull()
  })

  it('מספר קצר מ-9 ספרות אינו נחשב', () => {
    expect(detectReqTypeForMailbox('12345', 'g@chasamsofer.info')).toBeNull()
  })

  // 🔴 igud היא תיבת כניסה כללית — לא כל מייל אליה הוא בקשה.
  it('ת"ז בלבד לתיבת איגוד אינה בקשה', () => {
    expect(detectReqTypeForMailbox(VALID_ID, 'igud@chasamsofer.info')).toBeNull()
  })

  it('תיבה לא מוכרת אינה מזוהה', () => {
    expect(detectReqTypeForMailbox(VALID_ID, 'office@chasamsofer.info')).toBeNull()
    expect(detectReqTypeForMailbox(VALID_ID, undefined)).toBeNull()
  })
})

describe('תאימות לאחור — הנושא המלא ממשיך לעבוד', () => {
  // ⚠️ קישורי mailto שכבר נשלחו לאנשים מפנים ל-igud@ עם נושא מלא.
  it('נושא מלא לאיגוד — כמו קודם', () => {
    expect(detectReqTypeForMailbox(`בקשת הלוואה · ת.ז ${VALID_ID}`, 'igud@chasamsofer.info')).toBe('loan')
  })

  it('נושא מלא גובר על מיפוי התיבה', () => {
    // מייל עם נושא "בקשת לידה" שהגיע לתיבת ההלוואות — הנושא קובע.
    expect(detectReqTypeForMailbox(`בקשת לידה · ת.ז ${VALID_ID}`, 'g@chasamsofer.info')).toBe('birth')
  })

  it('נושא מלא בלי תיבה כלל', () => {
    expect(detectReqTypeForMailbox('בקשת סיוע רפואי · ת.ז 123', null)).toBe('financial_aid')
  })
})

describe('הנושא שהקליטה עובדת איתו', () => {
  it('ת"ז בלבד לתיבת אגף — מורכב נושא מלא', () => {
    const s = effectiveRequestSubject(VALID_ID, 'g@chasamsofer.info')
    expect(s).toBe(`בקשת הלוואה · ת.ז ${VALID_ID}`)
    // ⚠️ handleEmailRequest נשען על detectReqType(subject) — הנושא המורכב
    // חייב לעבור את הזיהוי הרגיל, אחרת הקליטה תיכשל.
    expect(isRequestSubject(s)).toBe(true)
  })

  it('נושא מלא נשאר כפי שהוא', () => {
    const orig = `בקשת לידה · ת.ז ${VALID_ID}`
    expect(effectiveRequestSubject(orig, 'y@chasamsofer.info')).toBe(orig)
  })

  it('מייל שאינו בקשה — הנושא לא משתנה', () => {
    expect(effectiveRequestSubject('שאלה כללית', 'g@chasamsofer.info')).toBe('שאלה כללית')
  })
})

describe('🔴 עקביות: קליטה ומענה אוטומטי מסכימים', () => {
  // אם השניים לא מסכימים, הפונה מקבל שני מיילים סותרים על פנייה אחת.
  const cases: [string, string | null][] = [
    [VALID_ID, 'g@chasamsofer.info'],
    [VALID_ID, 'y@chasamsofer.info'],
    ['מה קורה עם ההלוואה שלי?', 'g@chasamsofer.info'],
    [`בקשת הלוואה · ת.ז ${VALID_ID}`, 'igud@chasamsofer.info'],
    ['שלום וברכה', 'office@chasamsofer.info'],
    [INVALID_ID, 'g@chasamsofer.info'],
  ]

  for (const [subject, mailbox] of cases) {
    it(`"${subject.slice(0, 30)}" → ${mailbox ?? 'ללא תיבה'}`, () => {
      const isReq = isRequestMailFor(subject, mailbox)
      // הנושא שהקליטה תשתמש בו חייב להיות מזוהה בדיוק כאשר isReq אמת
      const eff = effectiveRequestSubject(subject, mailbox)
      expect(isRequestSubject(eff)).toBe(isReq)
    })
  }
})

describe('המיפוי עצמו', () => {
  it('כל תיבה ממופה לכתובת אמיתית בדומיין הארגון', () => {
    for (const box of Object.keys(MAILBOX_REQUEST_TYPE)) {
      expect(box).toMatch(/@chasamsofer\.info$/)
    }
  })

  it('igud ו-office אינם במיפוי — הם תיבות כניסה כלליות', () => {
    expect(MAILBOX_REQUEST_TYPE).not.toHaveProperty('igud@chasamsofer.info')
    expect(MAILBOX_REQUEST_TYPE).not.toHaveProperty('office@chasamsofer.info')
  })
})
