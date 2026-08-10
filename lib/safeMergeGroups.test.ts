// ⚠️ הכלל היחיד שנבדק כאן: שהמסלול ה"בטוח" לא יאסוף לעולם שני אנשים שונים.
//
// המשתמש מריץ אותו על מאות קבוצות בלחיצה אחת, בלי לעבור עליהן — ולכן כל
// התאמה עודפת כאן היא מיזוג שגוי של אנשים אמיתיים. זה כבר קרה במיזוג המקורב:
// אשכול אחד איחד שלושה אנשים שונים.
import { describe, it, expect } from 'vitest'
import { findSafeMergeGroups, exactNameKey, type SafeNode } from './safeMergeGroups'

const n = (id: string, name: string, parent_id: string | null, generation: number, status?: string): SafeNode =>
  ({ id, name, parent_id, generation, status })

describe('findSafeMergeGroups', () => {
  it('מקבץ שם זהה תחת אותו אב ובאותו דור', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי יואל אהרן וייס', 'p1', 6),
      n('b', 'רבי יואל אהרן וייס', 'p1', 6),
      n('c', 'רבי יואל אהרן וייס', 'p1', 6),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].map(x => x.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('⚠️ אב שונה → לא אותה קבוצה (בני דודים בשם זהה הם אנשים שונים)', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל וייס', 'p1', 6),
      n('b', 'רבי ישראל וייס', 'p2', 6),
    ])
    expect(groups).toHaveLength(0)
  })

  it('⚠️ דור שונה → לא אותה קבוצה (סבא ונכד באותו שם)', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל וייס', 'p1', 6),
      n('b', 'רבי ישראל וייס', 'p1', 7),
    ])
    expect(groups).toHaveLength(0)
  })

  it('⚠️ תואר שונה → *לא* אותה קבוצה במסלול הבטוח', () => {
    // autoMergeKey שבמיזוג הרגיל כן יזהה אותם. כאן בכוונה לא: ברגע שמסירים
    // תארים זו כבר פרשנות, והמסלול הזה רץ בלי בדיקה ידנית.
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל וייס', 'p1', 6),
      n('b', 'ישראל וייס', 'p1', 6),
    ])
    expect(groups).toHaveLength(0)
  })

  it('⚠️ שם דומה אך לא זהה → לא אותה קבוצה', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל בונם שרייבר', 'p1', 6),
      n('b', 'רבי ישראל בונים שרייבר', 'p1', 6), // כתיב אחר
      n('c', 'רבי ישראל שרייבר', 'p1', 6),
    ])
    expect(groups).toHaveLength(0)
  })

  it('רווחים כפולים בלבד — כן אותה קבוצה', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל  וייס', 'p1', 6),
      n('b', ' רבי ישראל וייס ', 'p1', 6),
    ])
    expect(groups).toHaveLength(1)
    expect(exactNameKey(groups[0][0].name)).toBe('רבי ישראל וייס')
  })

  it('צומת שנדחה אינו משתתף', () => {
    const groups = findSafeMergeGroups([
      n('a', 'רבי ישראל וייס', 'p1', 6),
      n('b', 'רבי ישראל וייס', 'p1', 6, 'rejected'),
    ])
    // נשאר אחד בלבד → אין קבוצה
    expect(groups).toHaveLength(0)
  })

  it('שורשים (בלי אב) מקובצים ביניהם ולא עם צמתים אחרים', () => {
    const groups = findSafeMergeGroups([
      n('a', 'מרן החתם סופר', null, 1),
      n('b', 'מרן החתם סופר', null, 1),
      n('c', 'מרן החתם סופר', 'p1', 1),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('שם ריק אינו יוצר קבוצה', () => {
    expect(findSafeMergeGroups([
      n('a', '   ', 'p1', 6),
      n('b', '', 'p1', 6),
    ])).toHaveLength(0)
  })

  it('כמה קבוצות נפרדות, בסדר קבוע לפי דור ואז שם', () => {
    const groups = findSafeMergeGroups([
      n('a', 'ב', 'p1', 7), n('b', 'ב', 'p1', 7),
      n('c', 'א', 'p1', 6), n('d', 'א', 'p1', 6),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0][0].generation).toBe(6)
    expect(groups[1][0].generation).toBe(7)
  })
})
