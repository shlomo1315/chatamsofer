import { describe, it, expect } from 'vitest'
import { autoMergeKey, groupForAutoMerge, pickKeepId, planCascade, type MergeNodeRow } from './lineageMerge'

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מיזוג אב-קדמון לתוך צאצא — התקלה של 25.08.
//
// מיזוג cascade מיזג את "בעל הכתב סופר" (דור 1) לתוך צאצא מדור 5 יחד עם
// 97 ילדיו. נוצר מעגל: אב שהוא גם בן של בנו. התצוגה טיפסה בשרשרת ההורים
// והציגה את אותם שני שמות עד "דור 50", וכל העץ נצבע אדום.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 הגנה מפני מעגל במיזוג', () => {
  const chain = (): MergeNodeRow[] => ([
    { id: 'g1', name: 'רבי אברהם סופר',  parent_id: null, generation: 1, status: 'verified', relation: null },
    { id: 'g2', name: 'רבי שלום שטרן',   parent_id: 'g1', generation: 2, status: 'verified', relation: null },
    { id: 'g3', name: 'רבי שמחה שטרן',   parent_id: 'g2', generation: 3, status: 'verified', relation: null },
    { id: 'g4', name: 'רבי אברהם שפר',   parent_id: 'g3', generation: 4, status: 'verified', relation: null },
    { id: 'g5', name: 'רבי יחיאל קוריץ', parent_id: 'g4', generation: 5, status: 'verified', relation: null },
  ])

  /** האם התוכנית מייצרת מעגל כשמיישמים אותה? */
  const createsCycle = (plan: ReturnType<typeof planCascade>, nodes: MergeNodeRow[]) => {
    const by = new Map(nodes.map(n => [n.id, { ...n }]))
    const dead = new Set<string>()
    for (const st of plan.steps) {
      for (const m of st.mergeIds) {
        for (const n of by.values()) if (n.parent_id === m) n.parent_id = st.keepId
        dead.add(m)
      }
    }
    for (const start of by.keys()) {
      if (dead.has(start)) continue
      const seen = new Set<string>()
      let cur: string | null | undefined = start
      while (cur && !dead.has(cur)) {
        if (seen.has(cur)) return true
        seen.add(cur)
        cur = by.get(cur)?.parent_id
      }
    }
    return false
  }

  it('🔴 סירוב למזג אב-קדמון לתוך צאצא', () => {
    // g1 (השורש) לתוך g5 (דור 5) — בדיוק מה שקרה בפרודקשן.
    const nodes = chain()
    const plan = planCascade(nodes, 'g5', ['g1'], { up: false, down: false })
    expect(plan.steps).toHaveLength(0)
    expect(createsCycle(plan, nodes)).toBe(false)
  })

  it('🔴 סירוב גם בכיוון ההפוך — צאצא לתוך אב-קדמון', () => {
    // ⚠️ שתי הצורות יוצרות מעגל; חסימה של אחת בלבד משאירה את הדלת פתוחה.
    const nodes = chain()
    const plan = planCascade(nodes, 'g1', ['g5'], { up: false, down: false })
    expect(plan.steps).toHaveLength(0)
    expect(createsCycle(plan, nodes)).toBe(false)
  })

  it('🔴 סירוב גם להורה ישיר', () => {
    const nodes = chain()
    const plan = planCascade(nodes, 'g5', ['g4'], { up: false, down: false })
    expect(plan.steps).toHaveLength(0)
  })

  it('⚠️ מיזוג לגיטימי של אחים ממשיך לעבוד', () => {
    // ההגנה חייבת לחסום מעגלים בלבד — לא את העבודה עצמה.
    const nodes: MergeNodeRow[] = [
      ...chain(),
      { id: 'dup', name: 'רבי יחיאל קוריץ', parent_id: 'g4', generation: 5, status: 'verified', relation: null },
    ]
    const plan = planCascade(nodes, 'g5', ['dup'], { up: false, down: false })
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].mergeIds).toContain('dup')
    expect(createsCycle(plan, nodes)).toBe(false)
  })

  it('⚠️ מפל שלם על שרשרת אינו יוצר מעגל', () => {
    // המפל רץ עם up+down על עץ עם כפילויות בכמה דורות.
    const nodes: MergeNodeRow[] = [
      ...chain(),
      { id: 'g3b', name: 'רבי שמחה שטרן',   parent_id: 'g2', generation: 3, status: 'verified', relation: null },
      { id: 'g4b', name: 'רבי אברהם שפר',   parent_id: 'g3b', generation: 4, status: 'verified', relation: null },
    ]
    const plan = planCascade(nodes, 'g4', ['g4b'], { up: true, down: true })
    expect(createsCycle(plan, nodes)).toBe(false)
  })

  it('⚠️ מעגל שכבר קיים בנתונים אינו מקפיא את התכנון', () => {
    // 🔴 מגן הצעדים: בלעדיו הבדיקה עצמה נכנסת ללולאה אינסופית על נתונים
    // פגומים — כלומר הקוד שנועד למנוע את התקלה היה תלוי בכך שהיא לא קרתה.
    const broken: MergeNodeRow[] = [
      { id: 'a', name: 'א', parent_id: 'b', generation: 5, status: 'verified', relation: null },
      { id: 'b', name: 'ב', parent_id: 'a', generation: 6, status: 'verified', relation: null },
      { id: 'c', name: 'ג', parent_id: 'a', generation: 7, status: 'verified', relation: null },
    ]
    const plan = planCascade(broken, 'c', ['b'], { up: false, down: false })
    expect(Array.isArray(plan.steps)).toBe(true)
  })
})
