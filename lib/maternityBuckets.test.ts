import { describe, it, expect } from 'vitest'
import { awaitingFixes, matchesBucket, awaitingInquiryReply, returnedFromInquiry, adjacentInBucket, isBucket, type AdjacentRow } from './maternityBuckets'

// ⚠️ מה שנבדק כאן הוא ההסכמה בין הרשימה לניווט. כשהם חלוקים, "הבאה" קופצת
// ליולדת מלשונית אחרת — וזה בדיוק המצב שהתיקון בא לסגור.

const aid = (o: Partial<AdjacentRow> & { id: string }): AdjacentRow => ({
  status: 'pending', baby_name: 'משה', baby_name_pending: false, ...o,
})

describe('ממתין לתיקונים', () => {
  it('תיקון שם פתוח', () => {
    expect(awaitingFixes(aid({ id: 'a', baby_name: null, baby_name_pending: true }))).toBe(true)
  })

  it('🔴 גם השלמת מסמכים — המקור שלא נספר קודם', () => {
    // תיק שנשלחה עליו בקשת מסמכים ישב ב"ממתין לאישור", והמזכירות חיפשה בו
    // מה חסר בזמן שהכדור היה אצל היולדת.
    expect(awaitingFixes(aid({ id: 'a', beneficiary: { eligibility_status: 'docs_pending' } }))).toBe(true)
  })

  it('מסמכים שחזרו כבר אינם תיקון פתוח', () => {
    expect(awaitingFixes(aid({ id: 'a', beneficiary: { eligibility_status: 'docs_returned' } }))).toBe(false)
  })

  it('join שמגיע כמערך נתמך', () => {
    expect(awaitingFixes(aid({ id: 'a', beneficiary: [{ eligibility_status: 'docs_pending' }] }))).toBe(true)
  })

  it('תיק שאושר אינו נספר, גם אם נשאר דגל', () => {
    // אחרת סכום הלשוניות גדול מסך הכול, והתיק נראה כאילו לא טופל.
    expect(awaitingFixes(aid({ id: 'a', status: 'active', baby_name: null, baby_name_pending: true }))).toBe(false)
  })
})

describe('הפרדת הלשוניות', () => {
  it('"ממתין לאישור" אינו כולל את מי שממתין לתיקון', () => {
    const withFix = aid({ id: 'a', beneficiary: { eligibility_status: 'docs_pending' } })
    expect(matchesBucket(withFix, 'pending')).toBe(false)
    expect(matchesBucket(withFix, 'pending_fixes')).toBe(true)
  })

  it('"הכל" כולל את כולם', () => {
    expect(matchesBucket(aid({ id: 'a', status: 'cancelled' }), 'all')).toBe(true)
  })

  it('סטטוס רגיל מותאם ישירות', () => {
    expect(matchesBucket(aid({ id: 'a', status: 'active' }), 'active')).toBe(true)
    expect(matchesBucket(aid({ id: 'a', status: 'active' }), 'cancelled')).toBe(false)
  })

  it('isBucket דוחה ערך מהכתובת שאינו לשונית', () => {
    expect(isBucket('pending_fixes')).toBe(true)
    expect(isBucket('drop table')).toBe(false)
    expect(isBucket(undefined)).toBe(false)
  })
})

describe('שכנים בתוך הקבוצה', () => {
  // created_at יורד: c3 (חדש) → c2 → c1 (ישן)
  const rows: AdjacentRow[] = [
    aid({ id: 'c3', created_at: '2026-03-01', status: 'pending' }),
    aid({ id: 'c2', created_at: '2026-02-01', status: 'active' }),
    aid({ id: 'c1', created_at: '2026-01-01', status: 'pending' }),
  ]

  it('מדלג על מי שאינו בקבוצה', () => {
    // מ-c3 ב"ממתין לאישור": הבאה היא c1, לא c2 המאושרת שביניהן.
    expect(adjacentInBucket(rows, { id: 'c3', created_at: '2026-03-01' }, 'pending'))
      .toEqual({ prevId: null, nextId: 'c1' })
  })

  it('ב"הכל" השכנה המיידית חוזרת', () => {
    expect(adjacentInBucket(rows, { id: 'c3', created_at: '2026-03-01' }, 'all'))
      .toEqual({ prevId: null, nextId: 'c2' })
  })

  it('🔴 הרצף נשמר גם אחרי שהתיק הנוכחי יצא מהקבוצה', () => {
    // התרחיש שהמנהל ביקש: נכנסים מ"ממתין לאישור", מאשרים, ולוחצים "הבאה".
    // התיק כבר 'active', אבל הניווט חייב להמשיך ברשימת הממתינות.
    const after: AdjacentRow[] = [
      aid({ id: 'c3', created_at: '2026-03-01', status: 'active' }),
      aid({ id: 'c2', created_at: '2026-02-01', status: 'pending' }),
      aid({ id: 'c1', created_at: '2026-01-01', status: 'pending' }),
    ]
    expect(adjacentInBucket(after, { id: 'c3', created_at: '2026-03-01' }, 'pending'))
      .toEqual({ prevId: null, nextId: 'c2' })
  })

  it('קצה הרשימה מחזיר null לשני הכיוונים', () => {
    expect(adjacentInBucket(rows, { id: 'c1', created_at: '2026-01-01' }, 'pending'))
      .toEqual({ prevId: 'c3', nextId: null })
  })

  it('קבוצה ריקה', () => {
    expect(adjacentInBucket(rows, { id: 'c3', created_at: '2026-03-01' }, 'cancelled'))
      .toEqual({ prevId: null, nextId: null })
  })

  it('חותמות זמן זהות אינן יוצרות לולאה', () => {
    // שוויון ב-created_at נשבר ב-id, אחרת שני תיקים היו מצביעים זה על זה.
    const same: AdjacentRow[] = [
      aid({ id: 'b', created_at: '2026-01-01' }),
      aid({ id: 'a', created_at: '2026-01-01' }),
      aid({ id: 'c', created_at: '2026-01-01' }),
    ]
    const from = adjacentInBucket(same, { id: 'b', created_at: '2026-01-01' }, 'pending')
    expect(from).toEqual({ prevId: 'a', nextId: 'c' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// בירור מול היולדת — מי שנשלח אליה בירור יורדת מהרשימה עד שתענה.
// 🔴 קודם התיק המשיך לשבת ב"ממתין לאישור" והמזכירות חיפשה שוב ושוב מה חסר
// בו, בזמן שהכדור היה אצל היולדת.
// ─────────────────────────────────────────────────────────────────────────────
describe('בירור מול היולדת', () => {
  const pend = (d?: string | null) => ({ status: 'pending', inquiryLastDirection: d })
  const admin = (d?: string | null) => ({ status: 'deep_review', inquiryLastDirection: d })

  it('🔴 נשלח בירור — יורדת מ"ממתין לאישור"', () => {
    expect(matchesBucket(pend('staff'), 'pending')).toBe(false)
    expect(awaitingInquiryReply(pend('staff'))).toBe(true)
  })

  it('🔴 נשלח בירור — יורדת גם מ"ממתין לאישור מנהל"', () => {
    // גם למנהל אין מה להכריע עד שתענה.
    expect(matchesBucket(admin('staff'), 'deep_review')).toBe(false)
  })

  it('⚠️ אך נשארת ב"הכל" — היא לא נעלמת מהמערכת', () => {
    expect(matchesBucket(pend('staff'), 'all')).toBe(true)
    expect(matchesBucket(admin('staff'), 'all')).toBe(true)
  })

  it('🔴 השיבה — חוזרת לרשימה עם התווית', () => {
    expect(matchesBucket(pend('applicant'), 'pending')).toBe(true)
    expect(returnedFromInquiry(pend('applicant'))).toBe(true)
    expect(matchesBucket(admin('applicant'), 'deep_review')).toBe(true)
    expect(returnedFromInquiry(admin('applicant'))).toBe(true)
  })

  it('תיק בלי בירור מוצג כרגיל', () => {
    // ⚠️ רוב התיקים כאלה — ברירת מחדל שמסתירה הייתה מרוקנת את הרשימה.
    expect(matchesBucket(pend(null), 'pending')).toBe(true)
    expect(matchesBucket(pend(undefined), 'pending')).toBe(true)
    expect(awaitingInquiryReply(pend(null))).toBe(false)
    expect(returnedFromInquiry(pend(null))).toBe(false)
  })

  it('⚠️ תיק סגור אינו מושפע', () => {
    // בירור ישן בתיק מאושר לא יסתיר אותו מ"מאושר".
    expect(matchesBucket({ status: 'active', inquiryLastDirection: 'staff' }, 'active')).toBe(true)
    expect(matchesBucket({ status: 'cancelled', inquiryLastDirection: 'staff' }, 'cancelled')).toBe(true)
  })

  it('⚠️ בירור גובר על "ממתין לתיקונים"', () => {
    // שניהם אומרים "הכדור אצלה"; הכפילות הייתה מציגה אותה בלשונית אחת.
    const a = { status: 'pending', baby_name_pending: true, inquiryLastDirection: 'staff' }
    expect(matchesBucket(a, 'pending_fixes')).toBe(false)
    expect(matchesBucket(a, 'all')).toBe(true)
  })
})
