import { describe, it, expect } from 'vitest'
import { evaluatePick, pickMessage, type PickState } from './holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שני שערים חדשים לבחירת המוקד: אישור המשפחה, ומועד אחרון.
//
// ⚠️ נכתב אחרי תקלה אמיתית: הנחתי ש-evaluatePick בודקת אישור, אמרתי
// שפתיחת הבחירה בטוחה, ו-87 משפחות שאינן מאושרות בחרו מוקד. הבדיקות
// כאן הן מה שהיה תופס את זה.
// ─────────────────────────────────────────────────────────────────────────────

const base: PickState = {
  centersOpen: true,
  approved: true,
  deadlinePassed: false,
  currentCenterId: null,
  centerExists: true,
  centerIsOpenInDistribution: true,
  centerTaken: 0,
  centerCapacity: null,
}

describe('🔴 שער האישור', () => {
  it('משפחה מאושרת — עוברת', () => {
    expect(evaluatePick(base, 'c1')).toEqual({ ok: true })
  })

  it('🔴 משפחה שאינה מאושרת — נחסמת גם כשהבחירה פתוחה', () => {
    const r = evaluatePick({ ...base, approved: false }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'not_approved' })
  })

  it('⚠️ מתג סגור גובר על חוסר אישור — "סגור" מדויק יותר למי שאינו מאושר', () => {
    const r = evaluatePick({ ...base, approved: false, centersOpen: false }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'closed' })
  })

  it('🔴 מי שכבר בחר שומע את המוקד שלו גם אם אינו מאושר', () => {
    // ⚠️ 87 משפחות בחרו לפני שהשער נסגר. חסימתן מלשמוע מה בחרו
    // הופכת שגיאה שלנו לעונש שלהן.
    const r = evaluatePick({ ...base, approved: false, currentCenterId: 'c9' }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'locked' })
  })
})

describe('🔴 שער המועד האחרון', () => {
  it('המועד חלף — נחסם', () => {
    const r = evaluatePick({ ...base, deadlinePassed: true }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'deadline' })
  })

  it('⚠️ גם אחרי המועד — מי שבחר שומע את בחירתו', () => {
    const r = evaluatePick({ ...base, deadlinePassed: true, currentCenterId: 'c9' }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'locked' })
  })

  it('⚠️ מתג סגור גובר על המועד', () => {
    const r = evaluatePick({ ...base, deadlinePassed: true, centersOpen: false }, 'c1')
    expect(r).toEqual({ ok: false, reason: 'closed' })
  })
})

describe('⚠️ תאימות לאחור — שדה חסר אינו חוסם', () => {
  // 🔴 קורא ישן שאינו מעביר approved/deadlinePassed היה מאבד את כל
  // הבחירות בשקט אילו undefined נחשב "לא מאושר".
  it('approved חסר → לא חוסם', () => {
    const s = { ...base } as Partial<PickState>
    delete s.approved
    expect(evaluatePick(s as PickState, 'c1')).toEqual({ ok: true })
  })

  it('deadlinePassed חסר → לא חוסם', () => {
    const s = { ...base } as Partial<PickState>
    delete s.deadlinePassed
    expect(evaluatePick(s as PickState, 'c1')).toEqual({ ok: true })
  })
})

describe('הודעות', () => {
  it('לא מאושר — מסביר מה לעשות, לא רק שנכשל', () => {
    expect(pickMessage('not_approved')).toContain('אישור')
  })

  it('אחרי המועד — אומר שהמועד חלף', () => {
    expect(pickMessage('deadline')).toContain('הסתיים')
  })

  it('⚠️ אין ב{center} בהודעות החדשות — הן אינן תלויות במוקד', () => {
    expect(pickMessage('not_approved')).not.toContain('{center}')
    expect(pickMessage('deadline')).not.toContain('{center}')
  })
})
