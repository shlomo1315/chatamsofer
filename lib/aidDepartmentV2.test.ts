import { describe, it, expect } from 'vitest'
import { displayStatus, parseManagerReply, sanitizeFamily, sanitizeIncome, totalIncome, souls, perCapita, ageFrom, findPrevious, prevText, NEED, isOptionalDoc, maskId, sourceLabel } from './aidDepartmentV2'

describe('displayStatus', () => {
  it('אצל המנהל מתפצל לפי תשובה', () => {
    expect(displayStatus({ status: 'awaiting_decision' })).toBe('manager')
    expect(displayStatus({ status: 'awaiting_decision', decision_reply: 'מאושר' })).toBe('back')
    expect(displayStatus({ status: 'approved' })).toBe('approved')
    expect(displayStatus({ status: 'pending' })).toBe('pending')
  })
})

describe('parseManagerReply', () => {
  it('מזהה אישור עם סכום', () => {
    expect(parseManagerReply('מאושר 6000. לחלק לשני תשלומים')).toEqual({ decision: 'approved', amount: 6000 })
    expect(parseManagerReply('מאושר 6,000')).toEqual({ decision: 'approved', amount: 6000 })
  })
  it('"לא מאושר" הוא דחייה ולא אישור', () => {
    expect(parseManagerReply('לא מאושר כרגע. שיפנו לגמ"ח')).toEqual({ decision: 'rejected', amount: null })
  })
  it('מתעלם מהציטוט של המייל המקורי', () => {
    expect(parseManagerReply('מאושר 3000\n> לא מאושר')).toEqual({ decision: 'approved', amount: 3000 })
  })
  it('טקסט לא ברור לא מנוחש', () => {
    expect(parseManagerReply('נדבר מחר').decision).toBeNull()
    expect(parseManagerReply('').decision).toBeNull()
  })
})

describe('משפחה והכנסות', () => {
  const f = sanitizeFamily({ wife: { name: 'שרה', id: '12-345', birth: '1987-09-02' }, kids: [{ name: 'אליעזר', status: 'נשוי' }, { name: 'חיה', status: 'בבית' }, { name: '' }, { name: 'נתן', status: 'זבל' }] })
  it('מנקה ילדים ריקים ומצב לא חוקי', () => {
    expect(f.kids.map(k => k.name)).toEqual(['אליעזר', 'חיה', 'נתן'])
    expect(f.kids[2].status).toBe('בבית')
    expect(f.wife?.id).toBe('12345')
  })
  it('מגביל את מספר הילדים', () => {
    expect(sanitizeFamily({ kids: Array.from({ length: 50 }, () => ({ name: 'א' })) }).kids).toHaveLength(30)
  })
  it('מחשב סה"כ ולנפש בלי ילדים נשואים', () => {
    const i = sanitizeIncome({ husband: '3,200', wife: 5400, benefits: 1150, other: -5, rent: 4300 })
    expect(totalIncome(i)).toBe(9750)
    expect(souls(f)).toBe(4)
    expect(perCapita(i, f)).toBe(2438)
    expect(i.other).toBe(0)
  })
  it('גיל מתאריך לידה', () => {
    expect(ageFrom('1985-03-14', new Date('2026-11-11'))).toBe(41)
    expect(ageFrom('1985-12-14', new Date('2026-11-11'))).toBe(40)
    expect(ageFrom('')).toBeNull()
  })
})

describe('הגיש בעבר', () => {
  const rows = [
    { id: 'a', request_no: 982, created_at: '2026-06-03T10:00:00Z', status: 'approved', amount: 4000, applicant_id_number: '012345678' },
    { id: 'b', request_no: 1047, created_at: '2026-11-09T10:00:00Z', status: 'pending', applicant_id_number: '12345678' },
    { id: 'c', request_no: 1048, created_at: '2026-11-10T10:00:00Z', status: 'pending', applicant_id_number: '999999999' },
  ]
  it('מוצא בקשה קודמת לפי ת"ז, גם עם אפס מוביל', () => {
    expect(findPrevious(rows[1], rows)?.id).toBe('a')
    expect(findPrevious(rows[2], rows)).toBeNull()
    expect(findPrevious(rows[0], rows)).toBeNull()
  })
  it('טקסט פנימי', () => {
    expect(prevText(rows[0])).toBe('982 · 3.6.2026 · אושר 4,000 ₪')
    expect(prevText({ ...rows[0], status: 'rejected' })).toContain('לא אושר')
  })
})

describe('עזרים', () => {
  it('רשימות מסמכים מתחילות בת"ז, וממליץ אינו חובה', () => {
    for (const l of Object.values(NEED)) expect(l[0]).toMatch(/תעודת זהות/)
    expect(NEED.econ.filter(isOptionalDoc)).toHaveLength(1)
  })
  it('מיסוך ת"ז ומקור', () => {
    expect(maskId('012345482')).toBe('0•••••482')
    expect(sourceLabel({ source: 'public', beneficiary_id: 'x' })).toBe('צאצא רשום')
    expect(sourceLabel({ source: 'public' })).toBe('מהקישור')
  })
})

describe('מייל למנהל', () => {
  it('בונה שורות משפחה, הכנסה ובקשה קודמת', async () => {
    const { managerMailData } = await import('./aidDepartmentV2')
    const d = managerMailData({
      id: 'x', request_no: 1047, created_at: '2026-11-09T10:00:00Z', status: 'pending', aid_type: 'medical', requested_amount: 8000,
      reason: 'ניתוח', source: 'public', beneficiary_id: 'b', beneficiary: { full_name: 'מרדכי', family_name: 'לנגר', id_number: '012345482', birth_date: '1985-03-14' },
      family: { wife: { name: 'שרה לנגר', birth: '1987-09-02' }, kids: [{ name: 'א', birth: '2017-01-01' }] },
      income: { husband: 3200, husbandJob: 'אברך', rent: 4300 },
    }, { id: 'p', request_no: 982, created_at: '2026-06-03T10:00:00Z', status: 'approved', amount: 4000, aid_type: 'medical' }, ['a.pdf'])
    expect(d.name).toBe('מרדכי לנגר')
    expect(d.idMasked).toBe('0•••••482')
    expect(d.previous).toBe('בקשה 982 מ-3.6.2026 (סיוע רפואי) · אושרה 4,000 ₪')
    expect(d.kidsLine).toBe('1 ילדים, 1 מהם מתחת לגיל 18')
    expect(d.income.map(i => i.label)).toEqual(['הבעל', 'שכר דירה'])
  })
})
