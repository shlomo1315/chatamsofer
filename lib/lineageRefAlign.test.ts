import { describe, it, expect } from 'vitest'
import { planRefAlignment, sameName, type AlignNode, type AlignRef } from './lineageRefAlign'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יישור דורות 2–5 לקובץ המאושר — המקרה שחשף (פרידמן 315287292, 12.10):
// אברהם חנוך תחת הכתב סופר במקום תחת צבי יהודה, דור 4 חסר, ושלושה מדור 5
// יושבים בדור 3. משפחות בנו עותק ממתין נכון במקביל.
// ─────────────────────────────────────────────────────────────────────────────

const ref: AlignRef[] = [
  { key: 'ROOT', name: 'החתם סופר', generation: 1, parent_key: null },
  { key: 'KS', name: 'רבי אברהם שמואל בנימין בעל הכתב סופר', generation: 2, parent_key: 'ROOT' },
  { key: 'ZY', name: 'רבי צבי יהודה ורעכיל פרידמן', generation: 2, parent_key: 'ROOT' },
  { key: 'AH', name: 'רבי אברהם חנוך וחנה חייטשא פרידמן', generation: 3, parent_key: 'ZY' },
  { key: 'SB', name: 'רבי שמואל בנימין ודבורה פרידמן', generation: 4, parent_key: 'AH' },
  { key: 'YF', name: 'רבי יהודה פרידמן', generation: 5, parent_key: 'SB' },
]
const N = (id: string, name: string, parent_id: string | null, status = 'verified'): AlignNode => ({ id, name, parent_id, status })

const tree = (): AlignNode[] => [
  N('root', 'מרן החתם סופר זי"ע', null),
  N('ks', 'רבי אברהם שמואל בנימין בעל הכתב סופר', 'root'),
  N('zy', 'רבי צבי יהודה ורעכיל פרידמן', 'root'),
  N('ah', 'רבי אברהם חנוך וחנה חייטשא פרידמן', 'ks'),                // מאושר, במקום הלא נכון
  N('ahP', 'רבי אברהם חנוך ומרת חנה חייטשא פרידמן', 'zy', 'pending'), // עותק ממתין, במקום הנכון
  N('sbP', 'רבי שמואל בנימין ומרת דבורה פרידמן', 'ahP', 'pending'),
  N('yf', 'רבי יהודה פרידמן', 'ks'),                                 // מאושר, דור 3 במקום 5
  N('yfKid', 'רבי צבי ומרת פייגא מלכה פרידמן', 'yf', 'pending'),
]

describe('planRefAlignment', () => {
  it('🔴 ענף פרידמן — הכול חוזר למקומו', () => {
    const p = planRefAlignment(tree(), ref)
    expect(p.canonical.AH).toBe('ah')                 // המאושר נשאר הקנוני
    expect(p.canonical.SB).toBe('sbP')                // הממתין היחיד — מאושר ומקבל את שם הקובץ
    expect(p.canonical.YF).toBe('yf')
    expect(p.ops).toContainEqual({ op: 'move', id: 'ah', to: 'zy', name: 'רבי אברהם חנוך וחנה חייטשא פרידמן' })
    expect(p.ops).toContainEqual({ op: 'merge', keep: 'ah', ids: ['ahP'], name: 'רבי אברהם חנוך וחנה חייטשא פרידמן' })
    expect(p.ops).toContainEqual({ op: 'settle', id: 'sbP', name: 'רבי שמואל בנימין ודבורה פרידמן', verify: true })
    expect(p.ops).toContainEqual({ op: 'move', id: 'yf', to: 'sbP', name: 'רבי יהודה פרידמן' })
    expect(p.issues).toEqual([])
  })

  it('דור חסר בעץ — נוצר מהקובץ', () => {
    const p = planRefAlignment(tree().filter(n => n.id !== 'sbP'), ref)
    expect(p.ops.find(o => o.op === 'create')).toMatchObject({ name: 'רבי שמואל בנימין ודבורה פרידמן' })
  })

  it('🔴 עומק 6 ומטה — לעולם לא נוגעים (נכד ע"ש סבו)', () => {
    const t = [...tree(), N('deep', 'רבי יהודה פרידמן', 'yfKid', 'pending')]   // עומק 5 תחת yf? לא — yfKid בעומק 4→6 אחרי ההזזה
    const p = planRefAlignment(t, ref)
    expect(JSON.stringify(p.ops)).not.toContain('"deep"')
  })

  it('שם שתואם כמה שורות בקובץ — לא נוגעים, מדווח', () => {
    const r2 = [...ref, { key: 'YF2', name: 'רבי יהודה פרידמן', generation: 4, parent_key: 'AH' }]
    const t = [...tree(), N('amb', 'רבי יהודה פרידמן', 'ks', 'pending')]
    const p = planRefAlignment(t, r2)
    expect(JSON.stringify(p.ops)).not.toContain('"amb"')
  })

  it('צומת בעומק 2–5 שאינו בקובץ — לא נוגעים, מדווח', () => {
    const p = planRefAlignment([...tree(), N('x', 'רבי פלוני אלמוני', 'ks', 'pending')], ref)
    expect(JSON.stringify(p.ops)).not.toContain('"x"')
    expect(p.issues).toContainEqual({ id: 'x', name: 'רבי פלוני אלמוני', depth: 3, reason: 'no_ref_match' })
  })

  it('עץ שכבר מיושר — אפס פעולות', () => {
    const aligned = [
      N('root', 'מרן החתם סופר זי"ע', null), N('ks', ref[1].name, 'root'), N('zy', ref[2].name, 'root'),
      N('ah', ref[3].name, 'zy'), N('sb', ref[4].name, 'ah'), N('yf', ref[5].name, 'sb'),
    ]
    expect(planRefAlignment(aligned, ref).ops).toEqual([])
  })
})

describe('sameName — המקרים שנתפסו בהרצה היבשה (12.10)', () => {
  it('🔴 סוגריים באמצע לא מוחקים את שם המשפחה — שני אנשים שונים', () => {
    expect(sameName('רבי יצחק יהודה (לייב) וקיילא בלוי', 'רבי יצחק יהודה (לייב) סופר שרייבר')).toBe(false)
  })
  it('כינוי "בעל ..." אינו חלק מהשם', () => {
    expect(sameName('רבי ישעיהו בעל "שבט סופר" ובלומא ארנפלד', 'רבי ישעיהו ובלומא ארנפלד')).toBe(true)
  })
  it('כתיב יידי — אותו אדם', () => {
    expect(sameName('רבי בנימין זאב וגיטל ענגלסראטה', 'רבי בנימין זאב ומרת גיטל ענגאלסראטה')).toBe(true)
  })
  it('🔴 שתי נשים שונות — לא אותו צומת', () => {
    expect(sameName('רבי שמעון ומרת אליזבת בלומה שרייבר', 'רבי שמעון ומרת ינטה שרייבר')).toBe(false)
  })
  it('אישה חסרה בצד אחד — אותו אדם', () => {
    expect(sameName('רבי יוסף ברנפלד', 'רבי יוסף ומרת שרל ברנפלד')).toBe(true)
  })
  it('שם פרטי בלבד, בלי משפחה — לא מותאם (שמרני)', () => {
    expect(sameName('רבי שלמה', 'רבי שלמה (אביעד שר שלום) סופר')).toBe(false)
  })
  it('אישה בלבד בקובץ ⇒ הזוג שבו היא האישה', () => {
    expect(sameName('מרת רויזא גולדשטיין', 'רבי שלמה ומרת רויזא גולדשטיין')).toBe(true)
    expect(sameName('מרת רויזא גולדשטיין', 'רבי שלמה ומרת חנה גולדשטיין')).toBe(false)
  })
  it('אותו בעל, משפחה אחרת — לא', () => {
    expect(sameName('רבי משה ומלכה פריי', 'רבי משה ומלכה סופר')).toBe(false)
  })
})

describe('planRefAlignment — תיקוני ההרצה היבשה השנייה (12.10)', () => {
  const r: AlignRef[] = [
    { key: 'ROOT', name: 'החתם סופר', generation: 1, parent_key: null },
    { key: 'P', name: 'רבי משה בונים ופרומעט רחל קרויס', generation: 2, parent_key: 'ROOT' },
    { key: 'YK', name: 'רבי יעקב קרויס', generation: 3, parent_key: 'P' },
    { key: 'AZ', name: 'רבי עקיבא וזלדה קרויס', generation: 3, parent_key: 'P' },
    { key: 'MS', name: 'רבי משה שרייבר', generation: 3, parent_key: 'P' },
    { key: 'RG', name: 'מרת רבקה גרוס', generation: 3, parent_key: 'P' },
  ]
  const base = [N('root', 'מרן', null), N('p', r[1].name, 'root')]

  it('🔴 "עקיבא" אינו "יעקב" — לא משנים שם של אדם אחר', () => {
    const p = planRefAlignment([...base, N('yk', 'רבי יעקב קרויס', 'p'), N('az', 'רבי עקיבא וזלדה קרויס', 'p')], r)
    expect(p.canonical.YK).toBe('yk')
    expect(p.canonical.AZ).toBe('az')
    expect(JSON.stringify(p.ops)).not.toContain('"settle","id":"az"')
  })
  it('🔴 שתי נשים סותרות — רק אחת מצטרפת, השנייה מדווחת', () => {
    const p = planRefAlignment([...base, N('m1', 'רבי משה שרייבר', 'p'), N('m2', 'רבי משה ומרת פריידא שרייבר', 'p', 'pending'), N('m3', 'רבי משה ומרת מלכה שרייבר', 'p', 'pending')], r)
    const m = p.ops.find(o => o.op === 'merge') as { ids: string[] }
    expect(m.ids).toHaveLength(1)
    expect(p.issues.some(i => i.reason === 'conflict')).toBe(true)
  })
  it('השם המלא עם בן הזוג נשמר כשבקובץ הוא חסר', () => {
    const p = planRefAlignment([...base, N('rg', 'רבי מנחם זאב ומרת רבקה גרוס', 'p', 'pending')], r)
    expect(p.ops).toContainEqual({ op: 'settle', id: 'rg', name: 'רבי מנחם זאב ומרת רבקה גרוס', verify: true })
  })
  it('הכתיב של הקובץ נשמר — רק בן הזוג נוסף מהעץ', () => {
    const p = planRefAlignment([...base, N('yk', 'רבי יעקב ומרת חיה קראוס', 'p', 'pending')], r)
    expect(p.ops).toContainEqual({ op: 'settle', id: 'yk', name: 'רבי יעקב ומרת חיה קרויס', verify: true })
  })
})
