import { describe, it, expect } from 'vitest'
import { eligibleForLoad, DEFAULT_LOAD_AMOUNT } from './holidayCardLoad'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כל שורה שעוברת את הסינון הזה = 500₪ שיוצאים מהתקציב.
//
// ⚠️ טעות כאן אינה באג בתצוגה: היא טעינה כפולה, או טעינה למי שלא אושר.
// ─────────────────────────────────────────────────────────────────────────────

const row = (over: Partial<Parameters<typeof eligibleForLoad>[0][0]> = {}) => ({
  id: 'r1', approval_status: 'approved', load_status: null,
  id_number: '123456789', name: 'משפחת ישראלי', ...over,
})

describe('eligibleForLoad — מי מקבל טעינה', () => {
  it('מאושר, טרם נטען, עם ת"ז — זכאי', () => {
    expect(eligibleForLoad([row()])).toHaveLength(1)
  })

  it('🔴 מי שלא אושר אינו נטען', () => {
    expect(eligibleForLoad([row({ approval_status: 'pending' })])).toHaveLength(0)
    expect(eligibleForLoad([row({ approval_status: 'rejected' })])).toHaveLength(0)
  })

  it('🔴 מי שכבר נטען אינו נטען שוב', () => {
    // ⚠️ זו ההגנה מפני טעינה כפולה — 500₪ נוספים לכל שורה.
    expect(eligibleForLoad([row({ load_status: 'loaded' })])).toHaveLength(0)
  })

  it('מי שנכשל בטעינה קודמת — כן נכלל בנסיון חוזר', () => {
    // כשל זמני (רשת, חסימת קצב) אינו סיבה לוותר על המשפחה.
    expect(eligibleForLoad([row({ load_status: 'failed' })])).toHaveLength(1)
  })

  it('🔴 בלי תעודת זהות אין את מי לחפש בנדרים', () => {
    expect(eligibleForLoad([row({ id_number: null })])).toHaveLength(0)
    expect(eligibleForLoad([row({ id_number: '  ' })])).toHaveLength(0)
  })

  it('מסנן רשימה מעורבת נכון', () => {
    const targets = eligibleForLoad([
      // ⚠️ ת"ז שונה לכל שורה: הסינון מדלג על ת"ז שכבר נראתה (הגנה מפני
      // טעינה כפולה), ות"ז זהה הייתה בודקת אותה ולא את הסינון שכאן.
      row({ id: 'a', id_number: '111111118' }),
      row({ id: 'b', approval_status: 'pending', id_number: '222222226' }),
      row({ id: 'c', load_status: 'loaded', id_number: '333333334' }),
      row({ id: 'd', id_number: null }),
      row({ id: 'e', load_status: 'failed', id_number: '444444442' }),
    ])
    expect(targets.map(t => t.recipientId)).toEqual(['a', 'e'])
  })

  it('מעביר ת"ז ושם ליעד', () => {
    const [t] = eligibleForLoad([row({ id_number: '987654321', name: 'כהן' })])
    expect(t.recipientId).toBe('r1')
    expect(t.idNumber).toBe('987654321')
    expect(t.name).toBe('כהן')
  })

  // ⚠️ 🔴 השדות הבאים אינם לתצוגה: הם מה שנשלח לנדרים כשהמשפחה אינה
  // קיימת שם וצריך להקים אותה. .map שהשמיט אותם היה מקים לקוח בלי טלפון
  // וכתובת — לקוח שאינו שמיש למוקד החלוקה, ובלי שום סימן שמשהו חסר.
  it('🔴 מעביר גם את פרטי ההקמה בנדרים', () => {
    const [t] = eligibleForLoad([row({
      id_number: '987654321',
      spouse_id_number: '022963573',
      family_name: 'כהן',
      full_name: 'יעקב',
      phone: '0501234567',
      phone2: '0527654321',
      email: 'a@b.com',
      address: 'הרצל 1',
      city: 'ירושלים',
    })])
    expect(t.spouseIdNumber).toBe('022963573')
    expect(t.familyName).toBe('כהן')
    expect(t.fullName).toBe('יעקב')
    expect(t.phone).toBe('0501234567')
    expect(t.phone2).toBe('0527654321')
    expect(t.email).toBe('a@b.com')
    expect(t.address).toBe('הרצל 1')
    expect(t.city).toBe('ירושלים')
  })

  // ── 🔴 רק מי שבחר מוקד ──
  //
  // הטעינה והשובר הם פעולה אחת: מיד אחרי הטעינה נשלח השובר, והשובר
  // בנוי כולו סביב המוקד. טעינה למי שטרם בחר מוציאה כסף בלי שיש מה
  // לשלוח, והמשפחה אינה יודעת לאן להגיע.
  it('🔴 מי שטרם בחר מוקד אינו נטען', () => {
    const targets = eligibleForLoad([
      { id: 'r1', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן', center_id: null },
    ])
    expect(targets).toHaveLength(0)
  })

  it('מי שבחר מוקד — נטען', () => {
    const targets = eligibleForLoad([
      { id: 'r1', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן', center_id: 'c1' },
    ])
    expect(targets).toHaveLength(1)
  })

  it('⚠️ בלי השדה כלל — נטען. הקוראים שאינם מעבירים center_id לא נשברים', () => {
    const targets = eligibleForLoad([
      { id: 'r1', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן' },
    ])
    expect(targets).toHaveLength(1)
  })

  // 🔴 הגנה אחרונה מפני טעינה כפולה.
  //
  // ⚠️ במסד יש אינדקס ייחודי (distribution_recipients_uniq_beneficiary)
  // שמונע שתי שורות לאותה משפחה בחלוקה אחת, וזו ההגנה החזקה. הבדיקה
  // כאן היא השכבה השנייה: אם הרשימה מגיעה פגומה מסיבה כלשהי, הכסף
  // עדיין לא ייצא פעמיים — וכסף שיצא פעמיים אינו ניתן להחזרה.
  it('🔴 אותה ת"ז פעמיים ברשימה → נטענת פעם אחת בלבד', () => {
    const targets = eligibleForLoad([
      { id: 'r1', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן' },
      { id: 'r2', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן' },
    ])
    expect(targets).toHaveLength(1)
  })

  it('⚠️ ת"ז שונות נטענות שתיהן — הסינון אינו גורף', () => {
    const targets = eligibleForLoad([
      { id: 'r1', approval_status: 'approved', load_status: null, id_number: '123456782', name: 'כהן' },
      { id: 'r2', approval_status: 'approved', load_status: null, id_number: '987654321', name: 'לוי' },
    ])
    expect(targets).toHaveLength(2)
  })

  it('שדות הקמה חסרים → null ולא undefined שנשלח לנדרים כמחרוזת', () => {
    const [t] = eligibleForLoad([row({ id_number: '987654321' })])
    expect(t.spouseIdNumber).toBeNull()
    expect(t.phone).toBeNull()
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(eligibleForLoad([])).toEqual([])
  })
})

describe('DEFAULT_LOAD_AMOUNT', () => {
  it('500 ש"ח כברירת מחדל', () => {
    expect(DEFAULT_LOAD_AMOUNT).toBe(500)
  })
})
