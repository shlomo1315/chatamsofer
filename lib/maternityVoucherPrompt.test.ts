import { describe, it, expect } from 'vitest'
import { planVoucherPrompt, voucherPromptText, type VoucherRelevantState } from './maternityVoucherPrompt'

// 🔴 המקרה שדווח: יולדת ביקשה בטעות רק מזון, אחר כך ביקשה גם בית החלמה —
// ולא קיבלה שובר. השליחה הייתה שקטה ולא עקבית בין המסכים. הכלל כאן הוא
// מקור האמת היחיד, ולכן הוא נבדק ולא משוכפל.

const base: VoucherRelevantState = {
  wantsFoodCard: true, wantsRecovery: false, recoveryHome: null, recoveryDays: 2,
}

describe('תוספת הטבה — חייבת להציע שובר', () => {
  it('🔴 ביקשה רק מזון, נוסף בית החלמה', () => {
    const p = planVoucherPrompt(base, { ...base, wantsRecovery: true, recoveryHome: 'אם וילד' })
    expect(p.shouldAsk).toBe(true)
    expect(p.kinds).toEqual(['recovery'])
    expect(p.changes.join(' ')).toContain('נוסף בית החלמה')
  })

  it('🔴 ביקשה רק בית החלמה, נוסף כרטיס מזון', () => {
    const only = { ...base, wantsFoodCard: false, wantsRecovery: true, recoveryHome: 'טלזסטון' }
    const p = planVoucherPrompt(only, { ...only, wantsFoodCard: true })
    expect(p.shouldAsk).toBe(true)
    expect(p.kinds).toEqual(['card'])
  })

  it('נוספו שתי ההטבות יחד — שני שוברים', () => {
    const none = { ...base, wantsFoodCard: false, wantsRecovery: false }
    const p = planVoucherPrompt(none, { ...none, wantsFoodCard: true, wantsRecovery: true, recoveryHome: 'ביכורים' })
    expect(p.kinds).toEqual(['card', 'recovery'])
  })
})

describe('עדכון פרטי בית החלמה — השובר שבידה כבר לא נכון', () => {
  const withHome = { ...base, wantsRecovery: true, recoveryHome: 'טלזסטון', recoveryDays: 2 }

  it('החלפת בית החלמה', () => {
    const p = planVoucherPrompt(withHome, { ...withHome, recoveryHome: 'ביכורים' })
    expect(p.shouldAsk).toBe(true)
    expect(p.changes[0]).toContain('טלזסטון')
    expect(p.changes[0]).toContain('ביכורים')
  })

  it('שינוי ימי זכאות', () => {
    const p = planVoucherPrompt(withHome, { ...withHome, recoveryDays: 4 })
    expect(p.kinds).toEqual(['recovery'])
    expect(p.changes.join(' ')).toContain('ימי זכאות')
  })

  it('גם בית וגם ימים — שובר אחד, שתי שורות הסבר', () => {
    const p = planVoucherPrompt(withHome, { ...withHome, recoveryHome: 'אם וילד', recoveryDays: 4 })
    expect(p.kinds).toEqual(['recovery'])
    expect(p.changes).toHaveLength(2)
  })
})

describe('⚠️ ביטול הטבה — לא שולחים שובר', () => {
  it('בוטל כרטיס מזון — מדווח ולא מוצע', () => {
    // שליחת שובר על הטבה שבוטלה מטעה את היולדת.
    const both = { ...base, wantsRecovery: true, recoveryHome: 'אם וילד' }
    const p = planVoucherPrompt(both, { ...both, wantsFoodCard: false })
    expect(p.shouldAsk).toBe(false)
    expect(p.removals).toContain('בוטל כרטיס מזון')
  })

  it('בוטל בית החלמה — מדווח ולא מוצע', () => {
    const both = { ...base, wantsRecovery: true, recoveryHome: 'אם וילד' }
    const p = planVoucherPrompt(both, { ...both, wantsRecovery: false })
    expect(p.shouldAsk).toBe(false)
    expect(p.removals).toContain('בוטל בית החלמה')
  })

  it('⚠️ בית החלמה שבוטל — שינוי הבית עצמו אינו מייצר שובר', () => {
    // אחרת ביטול שמאפס גם את שם הבית היה נספר כ"החלפת בית החלמה".
    const withHome = { ...base, wantsRecovery: true, recoveryHome: 'טלזסטון' }
    const p = planVoucherPrompt(withHome, { ...withHome, wantsRecovery: false, recoveryHome: null })
    expect(p.shouldAsk).toBe(false)
    expect(p.kinds).toEqual([])
  })
})

describe('אין שינוי — לא שואלים', () => {
  it('שמירה בלי לגעת בהטבות', () => {
    const s = { ...base, wantsRecovery: true, recoveryHome: 'אם וילד' }
    expect(planVoucherPrompt(s, { ...s }).shouldAsk).toBe(false)
  })

  it('שינוי שדה שאינו על השובר אינו מפעיל שאלה', () => {
    // שם התינוק/ת"ז נשמרים באותו טופס ואינם מופיעים על שובר ההבראה.
    const s = { ...base, wantsRecovery: true, recoveryHome: 'אם וילד' }
    expect(planVoucherPrompt(s, { ...s }).kinds).toEqual([])
  })

  it('ימי זכאות שאינם ידועים בצד אחד — לא נספר כשינוי', () => {
    // null אינו "שונה מ-2"; הוא פשוט לא נטען, ושאלה כאן היא רעש.
    const s = { ...base, wantsRecovery: true, recoveryHome: 'אם וילד', recoveryDays: null }
    expect(planVoucherPrompt(s, { ...s, recoveryDays: 2 }).shouldAsk).toBe(false)
  })
})

describe('נוסח השאלה', () => {
  it('שובר אחד', () => {
    expect(voucherPromptText(['recovery'])).toBe('לשלוח ליולדת שובר בית החלמה מעודכן?')
  })

  it('שני שוברים מחוברים ב-ו׳', () => {
    expect(voucherPromptText(['card', 'recovery']))
      .toBe('לשלוח ליולדת שובר כרטיס מזון ושובר בית החלמה מעודכן?')
  })
})
