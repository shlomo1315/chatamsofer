import { describe, it, expect } from 'vitest'
import {
  buildDraftBody, parseDraft, validateRequest, fieldsFor,
  detectReqType, SUBJECT_PREFIX, type ReqType,
} from './emailRequestForms'

// ─────────────────────────────────────────────────────────────────────────────
// הצלבה מלאה לכל סוגי הבקשות: הטופס שהמערכת מייצרת → הפרסור → הוולידציה.
// כל כשל כאן = בקשה אמיתית של משתמש שנדחית בלי סיבה.
// ─────────────────────────────────────────────────────────────────────────────

const ctx = {
  recoveryHomes: ['אם וילד', 'טלזסטון', 'ביכורים'],
  centers: [
    { id: 'c1', name: 'מוקד בית שמש רמה ב', city: 'בית שמש' },
    { id: 'c2', name: 'מוקד בני ברק', city: 'בני ברק' },
  ],
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

describe('טופס מלא כהלכה עובר ולידציה', () => {
  it('birth', () => {
    let d = buildDraftBody('birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', '01/07/2026')
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'שם הנולד/ת', 'יעקב')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456782')  // ת"ז תקינה
    d = fill(d, 'בית החלמה', 'טלזסטון')
    d = fill(d, 'מספר מוקד', '1')

    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    if (!r.ok) console.error('\n[birth] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('silent_birth', () => {
    let d = buildDraftBody('silent_birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', '01/07/2026')
    d = fill(d, 'בית החלמה', 'אם וילד')

    const r = validateRequest('silent_birth', parseDraft('silent_birth', d, ctx), ctx)
    if (!r.ok) console.error('\n[silent_birth] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('loan', () => {
    let d = buildDraftBody('loan', '318344884', ctx)
    d = fill(d, 'סכום ההלוואה המבוקש', '20000')
    d = fill(d, 'מספר התשלומים', '24')
    d = fill(d, 'מטרת ההלוואה', 'שמחה משפחתית')
    d = fill(d, 'האם פנית בעבר', 'לא הגשתי')

    const r = validateRequest('loan', parseDraft('loan', d, ctx), ctx)
    if (!r.ok) console.error('\n[loan] שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('loan — דוחה סכום מעל התקרה', () => {
    let d = buildDraftBody('loan', '318344884', ctx)
    d = fill(d, 'סכום ההלוואה המבוקש', '50000')   // מעל 30,000
    d = fill(d, 'מספר התשלומים', '24')
    d = fill(d, 'מטרת ההלוואה', 'שמחה משפחתית')
    d = fill(d, 'האם פנית בעבר', 'לא הגשתי')

    const r = validateRequest('loan', parseDraft('loan', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('30,000')
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
    d = fill(d, 'תאריך לידה', '01/07/2026')
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456789')  // ספרת ביקורת שגויה (התקינה: 2)
    d = fill(d, 'בית החלמה', 'טלזסטון')
    d = fill(d, 'מספר מוקד', '1')

    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('תעודת הזהות')
  })

  it('birth — בית החלמה שלא ברשימה', () => {
    let d = buildDraftBody('birth', '318344884', ctx)
    d = fill(d, 'תאריך לידה', '01/07/2026')
    d = fill(d, 'מין הנולד/ת', 'בן')
    d = fill(d, 'תעודת זהות של הנולד/ת', '123456782')
    d = fill(d, 'בית החלמה', 'בית שלא קיים')
    d = fill(d, 'מספר מוקד', '1')

    const r = validateRequest('birth', parseDraft('birth', d, ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('בית החלמה')
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
    // הטופס מבטיח "בין 1,000 ל-30,000". בלי אכיפה, ההבטחה הייתה שקרית.
    const r = validateRequest('loan', parseDraft('loan', loanBody('500'), ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('1,000')
  })

  it('סכום מעל המקסימום — נדחה', () => {
    const r = validateRequest('loan', parseDraft('loan', loanBody('50000'), ctx), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('30,000')
  })

  it('בדיוק המינימום — מתקבל', () => {
    const r = validateRequest('loan', parseDraft('loan', loanBody('1000'), ctx), ctx)
    if (!r.ok) console.error('שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })
})
