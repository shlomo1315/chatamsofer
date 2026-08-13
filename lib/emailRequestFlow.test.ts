import { describe, it, expect } from 'vitest'
import {
  buildDraftBody, parseDraft, validateRequest, fieldsFor,
  detectReqType, SUBJECT_PREFIX, attachmentsFor,
  LOAN_MIN_AMOUNT, LOAN_MAX_AMOUNT, type ReqType,
} from './emailRequestForms'

// ⚠️ הטסטים נגזרים מהקבועים ולא ממספרים קשיחים: כשהתקרה השתנתה
// מ-30,000 ל-10,000, טסט עם "20000" כסכום תקין היה נכשל בלי קשר לבאג.
const OVER_MAX = String(LOAN_MAX_AMOUNT + 1)
const VALID_AMOUNT = String(Math.round(LOAN_MAX_AMOUNT / 2))
const MAX_STR = LOAN_MAX_AMOUNT.toLocaleString('en-US')

// ─────────────────────────────────────────────────────────────────────────────
// הצלבה מלאה לכל סוגי הבקשות: הטופס שהמערכת מייצרת → הפרסור → הוולידציה.
// כל כשל כאן = בקשה אמיתית של משתמש שנדחית בלי סיבה.
// ─────────────────────────────────────────────────────────────────────────────

const ctx = {
  recoveryHomes: ['אם וילד', 'טלזסטון', 'ביכורים'],
  pending: false,
}

const TYPES: ReqType[] = ['birth', 'silent_birth', 'loan', 'financial_aid', 'widow']

describe('זיהוי הנושא — כל הסוגים', () => {
  for (const type of TYPES) {
    it(`${type}: הנושא שהטופס מייצר מזוהה חזרה`, () => {
      // בדיוק הנושא ש-draftMailto בונה
      const subject = `${SUBJECT_PREFIX[type]} · ת.ז 318344884`
      expect(detectReqType(subject)).toBe(type)
    })

    it(`${type}: מזוהה גם עם סימוני כיווניות של Gmail`, () => {
      // RLM שלקוח מייל RTL מזריק בין המילים
      const subject = `‏${SUBJECT_PREFIX[type]}‏ · ת.ז 318344884`
      expect(detectReqType(subject)).toBe(type)
    })
  }
})

describe('הצלבה: כל שדה בטופס נקרא חזרה', () => {
  for (const type of TYPES) {
    it(`${type}`, () => {
      const draft = buildDraftBody(type, '318344884', ctx)
      const parsed = parseDraft(type, draft, ctx)
      const missing = fieldsFor(type, ctx).map(f => f.key).filter(k => !(k in parsed))

      if (missing.length) {
        console.error(`\n[${type}] שדות שלא נקראו:`, missing)
        console.error(draft)
      }
      expect(missing).toEqual([])
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// טופס מלא כהלכה — לכל סוג — חייב לעבור ולידציה.
// ─────────────────────────────────────────────────────────────────────────────

/** ממלא שדה בטיוטה: מחליף את מה שאחרי התווית בערך שנתנו. */
function fill(draft: string, label: string, value: string): string {
  return draft
    .split('\n')
    .map(ln => (ln.trimStart().startsWith(label) ? `${ln.split(':')[0]}: ${value}` : ln))
    .join('\n')
}

// ⚠️ תאריך יחסי ל"היום" ולא תאריך קבוע. קודם היה כאן 01/07/2026 קשיח, וחלון
// ההגשה (30 יום מהלידה) פג ב-31/07 — כלומר הבדיקה עברה בירוק במשך חודש ואז
// נשברה מעצמה בחצות, בלי שאיש נגע בקוד. בדיקה שנשברת מהתקדמות הלוח בודקת את
// התאריך, לא את הלוגיקה.
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}
const RECENT_BIRTH = daysAgo(3)

describe('טופס מלא כהלכה עובר ולידציה', () => {
  it('birth', () => {
    let d = buildDraftBody('birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', RECENT_BIRTH)
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'שם הנולד/ת', 'יעקב')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456782')  // ת"ז תקינה
    d = fill(d, 'בית החלמה', 'טלזסטון')
    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    if (!r.ok) console.error('\n[birth] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('silent_birth', () => {
    let d = buildDraftBody('silent_birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', RECENT_BIRTH)
    d = fill(d, 'בית החלמה', 'אם וילד')

    const r = validateRequest('silent_birth', parseDraft('silent_birth', d, ctx), ctx)
    if (!r.ok) console.error('\n[silent_birth] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('loan', () => {
    let d = buildDraftBody('loan', '318344884', ctx)
    d = fill(d, 'סכום ההלוואה המבוקש', VALID_AMOUNT)
    d = fill(d, 'מספר התשלומים', '24')
    d = fill(d, 'מטרת ההלוואה', 'שמחה משפחתית')
    d = fill(d, 'האם פנית בעבר', 'לא הגשתי')

    const r = validateRequest('loan', parseDraft('loan', d, ctx), ctx)
    if (!r.ok) console.error('\n[loan] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('loan — דוחה סכום מעל התקרה', () => {
    let d = buildDraftBody('loan', '318344884', ctx)
    d = fill(d, 'סכום ההלוואה המבוקש', OVER_MAX)
    d = fill(d, 'מספר התשלומים', '24')
    d = fill(d, 'מטרת ההלוואה', 'שמחה משפחתית')
    d = fill(d, 'האם פנית בעבר', 'לא הגשתי')

    const r = validateRequest('loan', parseDraft('loan', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain(MAX_STR)
  })

  it('financial_aid', () => {
    let d = buildDraftBody('financial_aid', '318344884', ctx)
    d = fill(d, 'סיבת הבקשה', 'טיפול רפואי דחוף, עלות 8000 ש"ח')

    const r = validateRequest('financial_aid', parseDraft('financial_aid', d, ctx), ctx)
    if (!r.ok) console.error('\n[financial_aid] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('widow', () => {
    let d = buildDraftBody('widow', '318344884', ctx)
    d = fill(d, 'סוג הבקשה', 'סיוע כספי')
    d = fill(d, 'פירוט הבקשה', 'בקשה לסיוע')
    d = fill(d, 'סכום מבוקש', '3000')

    const r = validateRequest('widow', parseDraft('widow', d, ctx), ctx)
    if (!r.ok) console.error('\n[widow] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })
})

describe('טופס פגום מחזיר שגיאה מפורטת (ולא נקלט בשקט)', () => {
  it('birth — ת"ז לא תקינה של הנולד', () => {
    let d = buildDraftBody('birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', RECENT_BIRTH)
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456789')  // ספרת ביקורת שגויה (התקינה: 2)
    d = fill(d, 'בית החלמה', 'טלזסטון')
    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('תעודת הזהות')
  })

  it('birth — בית החלמה שלא ברשימה', () => {
    let d = buildDraftBody('birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', RECENT_BIRTH)
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456782')
    d = fill(d, 'בית החלמה', 'בית שלא קיים')
    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('בית החלמה')
  })
})

describe('טופס חתימת רב — חובה גם בהגשה במייל', () => {
  it('מופיע כצרופת חובה בטופס בקשת ההלוואה', () => {
    // ⚠️ בלי זה ההגשה במייל הופכת לעקיפה של הדרישה: בפורטל אי אפשר
    // להגיש בלי הטופס החתום, ומי שמגיש במייל היה נכנס לתור בלעדיו.
    const atts = attachmentsFor('loan', ctx)
    const rabbi = atts.find(a => a.name === 'טופס-חתימת-רב')
    expect(rabbi).toBeDefined()
    expect(rabbi?.required).toBe(true)
  })

  it('נכלל בטיוטה שנשלחת למבקש', () => {
    // אם הוא לא מופיע בטיוטה, המבקש אינו יודע שהוא נדרש — והבקשה
    // נדחית על משהו שמעולם לא ביקשנו ממנו.
    const draft = buildDraftBody('loan', '318344884', ctx)
    expect(draft).toContain('טופס-חתימת-רב')
  })

  it('בקשות אחרות אינן דורשות אותו', () => {
    expect(attachmentsFor('birth', ctx).some(a => a.name === 'טופס-חתימת-רב')).toBe(false)
    expect(attachmentsFor('financial_aid', ctx).some(a => a.name === 'טופס-חתימת-רב')).toBe(false)
  })
})

describe('מגבלות סכום ההלוואה', () => {
  const loanBody = (amount: string) => {
    let d = buildDraftBody('loan', '318344884', ctx)
    d = fill(d, 'סכום ההלוואה המבוקש', amount)
    d = fill(d, 'מספר התשלומים', '24')
    d = fill(d, 'מטרת ההלוואה', 'שמחה משפחתית')
    d = fill(d, 'האם פנית בעבר', 'לא הגשתי')
    return d
  }

  it('סכום מתחת למינימום — נדחה', () => {
    // הטופס מבטיח טווח מפורש. בלי אכיפה, ההבטחה הייתה שקרית.
    const r = validateRequest('loan', parseDraft('loan', loanBody('500'), ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('1,000')
  })

  it('סכום מעל המקסימום — נדחה', () => {
    const r = validateRequest('loan', parseDraft('loan', loanBody(OVER_MAX), ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain(MAX_STR)
  })

  it('בדיוק המינימום — מתקבל', () => {
    const r = validateRequest('loan', parseDraft('loan', loanBody('1000'), ctx), ctx)
    if (!r.ok) console.error('שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })
})
