import { describe, it, expect } from 'vitest'
import { autoMergeKey, groupForAutoMerge, pickKeepId, type MergeNodeRow } from './lineageMerge'

const n = (id: string, name: string, status = 'verified'): MergeNodeRow =>
  ({ id, name, parent_id: 'p', generation: 6, status, relation: null })

describe('מפתח המיזוג האוטומטי', () => {
  it('תואר אינו חלק מהזהות', () => {
    // ⚠️ הכפילות הנפוצה ביותר בנתונים: "רבי" מול "ר'". נרמול רגיל היה משאיר
    // אותם שונים, והמפל האוטומטי היה מפספס בדיוק את המקרה השכיח.
    expect(autoMergeKey('רבי מרדכי ושרה שטרלינג')).toBe(autoMergeKey("ר' מרדכי ושרה שטרלינג"))
    expect(autoMergeKey('הרב יעקב כהן')).toBe(autoMergeKey('יעקב כהן'))
  })

  it('סימני כבוד אינם חלק מהזהות', () => {
    expect(autoMergeKey('רבי משה זצ"ל לוי')).toBe(autoMergeKey('משה לוי'))
  })

  it('שם אמצעי עודף — מפתח שונה, כלומר לא ימוזג אוטומטית', () => {
    // ⚠️ הקו האדום: התאמה מקורבת לעולם אינה ממוזגת מעצמה.
    expect(autoMergeKey('רבי מרדכי ושרה שטרלינג')).not.toBe(autoMergeKey("ר' מרדכי צבי ושרה שטרלינג"))
  })
})

describe('קיבוץ לקבוצות מיזוג', () => {
  it('מקבץ רק שמות זהים, ומחזיר רק קבוצות של יותר מאחד', () => {
    const groups = groupForAutoMerge([
      n('1', 'רבי מרדכי ושרה שטרלינג'),
      n('2', "ר' מרדכי ושרה שטרלינג"),
      n('3', 'רבי יעקב ורחל מנדלוביץ'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].map(g => g.id).sort()).toEqual(['1', '2'])
  })

  it('צומת שנדחה אינו משתתף במיזוג', () => {
    // נדחה = החלטה מפורשת. המפל לא יבטל אותה בשקט.
    const groups = groupForAutoMerge([
      n('1', 'רבי מרדכי שטרלינג'),
      n('2', 'רבי מרדכי שטרלינג', 'rejected'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('שם ריק אינו מקבץ', () => {
    expect(groupForAutoMerge([n('1', '   '), n('2', '')])).toHaveLength(0)
  })
})

describe('מי נשאר אחרי המיזוג', () => {
  it('מאומת מנצח ממתין', () => {
    const keep = pickKeepId([n('a', 'x', 'pending'), n('b', 'x', 'verified')], new Map())
    expect(keep).toBe('b')
  })

  it('בין שווים — זה שיש לו יותר ילדים', () => {
    // פחות רשומות זזות ממקומן, פחות מקום לטעות
    const counts = new Map([['a', 1], ['b', 7]])
    expect(pickKeepId([n('a', 'x'), n('b', 'x')], counts)).toBe('b')
  })

  it('התוצאה יציבה — אותו קלט נותן אותה תוצאה', () => {
    // ⚠️ בלי מיון יציב, שתי הרצות על אותם נתונים היו בוחרות צמתים שונים
    // להשאיר, ותצוגה מקדימה לא הייתה מתארת את מה שיקרה בפועל.
    const g = [n('b', 'x'), n('a', 'x'), n('c', 'x')]
    expect(pickKeepId(g, new Map())).toBe('a')
    expect(pickKeepId([...g].reverse(), new Map())).toBe('a')
  })
})
