import { describe, it, expect } from 'vitest'
import { detectReqType, parseDraft } from './emailRequestForms'

// הקשר מינימלי לבדיקות — כמו שה-webhook בונה אותו
const ctx = {
  recoveryHomes: ['אם וילד', 'טלזסטון', 'ביכורים'],
  pending: false,
}

describe('detectReqType', () => {
  it('מזהה בקשת לידה', () => {
    expect(detectReqType('בקשת לידה · ת.ז 318344884')).toBe('birth')
  })

  it('מזהה גם עם סימוני כיווניות שלקוח המייל מזריק', () => {
    // RLM (U+200F) בין המילים — Gmail/Outlook מוסיפים את זה בנושא RTL
    const subject = '‏בקשת‏ ‏לידה‏ · ת.ז 318344884'
    expect(detectReqType(subject)).toBe('birth')
  })

  it('מזהה גם עם NBSP', () => {
    expect(detectReqType('בקשת לידה · ת.ז 318344884')).toBe('birth')
  })

  it('לידה שקטה גוברת על לידה', () => {
    expect(detectReqType('בקשת לידה שקטה · ת.ז 1')).toBe('silent_birth')
  })

  it('מזהה הלוואה', () => {
    expect(detectReqType('בקשת הלוואה · ת.ז 1')).toBe('loan')
  })

  it('מייל רגיל אינו בקשה', () => {
    expect(detectReqType('Re: הפצה')).toBeNull()
  })
})

describe('parseDraft — הנקודתיים אינן קריטיות', () => {
  it('פורמט תקין עם רווח', () => {
    const body = [
      'תאריך לידה (בפורמט DD/MM/YYYY, למשל 22/06/2026): 01/07/2026',
      'מין הנולד/ת (השאירו רק אחד, מחקו את השני): בן',
      'בית החלמה (השאירו רק אחד, מחקו את השאר): טלזסטון',
    ].join('\n')
    const out = parseDraft('birth', body, ctx)
    expect(out.birth_date).toBe('01/07/2026')
    expect(out.baby_gender).toBe('בן')
    expect(out.recovery_home).toBe('טלזסטון')
  })

  it('בלי רווח אחרי הנקודתיים', () => {
    const body = 'תעודת זהות של הנולד/ת (9 ספרות כולל ספרת ביקורת):000007070'
    expect(parseDraft('birth', body, ctx).baby_id_number).toBe('000007070')
  })

  it('בלי נקודתיים בכלל — רק רווח', () => {
    const body = 'תאריך לידה (בפורמט DD/MM/YYYY, למשל 22/06/2026) 01/07/2026'
    expect(parseDraft('birth', body, ctx).birth_date).toBe('01/07/2026')
  })

  it('מקף במקום נקודתיים', () => {
    const body = 'שם הנולד/ת (אם אין עדיין שם — השאירו ריק) - יעקב'
    expect(parseDraft('birth', body, ctx).baby_name).toBe('יעקב')
  })

  it('עמיד לסימוני כיווניות בתוך השורה', () => {
    const body = '‏בית החלמה (השאירו רק אחד, מחקו את השאר):‏ טלזסטון'
    expect(parseDraft('birth', body, ctx).recovery_home).toBe('טלזסטון')
  })

  it('עמיד ל-NBSP', () => {
    const body = 'בית החלמה (השאירו רק אחד, מחקו את השאר): טלזסטון'
    expect(parseDraft('birth', body, ctx).recovery_home).toBe('טלזסטון')
  })

  it('לא בולע שדה אחר שהוא תחילית', () => {
    // "תאריך לידה" ו-"תעודת זהות של הנולד/ת" — התוויות שונות, אין בלבול
    const body = [
      'תאריך לידה (בפורמט DD/MM/YYYY, למשל 22/06/2026): 01/07/2026',
      'תעודת זהות של הנולד/ת (9 ספרות כולל ספרת ביקורת): 123456782',
    ].join('\n')
    const out = parseDraft('birth', body, ctx)
    expect(out.birth_date).toBe('01/07/2026')
    expect(out.baby_id_number).toBe('123456782')
  })

  it('שדה ריק מוחזר כמחרוזת ריקה, לא undefined', () => {
    const body = 'הערות: '
    expect(parseDraft('birth', body, ctx).notes).toBe('')
  })
})
