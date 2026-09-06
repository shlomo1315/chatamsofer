// טסטים להשוואת שרשרות הדורות. הנתונים כאן לקוחים מבקשות אמיתיות במאגר
// (ליבוביץ שלמה, שישא שלמה אלימלך) — כולל הפורמט המדויק של הטקסט.
import { describe, it, expect } from 'vitest'
import {
  diffChains, normalizeName, parseChainText, extractProposedChain,
  extractRequesterNote, extractRequesterName, husbandName, matchChild, type ChainRow,
} from './lineageChainDiff'

const row = (generation: number, name: string, relation: 'son' | 'son_in_law' | null = null): ChainRow =>
  ({ generation, name, relation })

describe('normalizeName', () => {
  it('מתעלם מגרשיים, רווחים כפולים וניקוד', () => {
    expect(normalizeName('רבי  משה   סופר')).toBe('רבי משה סופר')
    expect(normalizeName('רבי יו"ט שישא')).toBe(normalizeName('רבי יו״ט שישא'))
    expect(normalizeName("ר' משה")).toBe(normalizeName('ר׳ משה'))
  })

  it('אינו ממזג שמות שונים באמת', () => {
    expect(normalizeName('רבי משה סופר')).not.toBe(normalizeName('רבי משה סופרי'))
  })
})

describe('diffChains', () => {
  it('שרשראות זהות — בלי הבדלים', () => {
    const c = [row(1, 'רבינו החתם סופר'), row(2, 'מרת גיטל')]
    const d = diffChains(c, [...c])
    expect(d.identical).toBe(true)
    expect(d.firstDivergence).toBeNull()
    expect(d.counts.same).toBe(2)
  })

  it('מזהה את הדור הראשון שנחלק', () => {
    const cur = [row(1, 'החתם סופר'), row(2, 'מרת גיטל'), row(3, 'רבי אלמוני')]
    const pro = [row(1, 'החתם סופר'), row(2, 'מרת גיטל'), row(3, 'רבי פלוני')]
    const d = diffChains(cur, pro)
    expect(d.firstDivergence).toBe(3)
    expect(d.counts.changed).toBe(1)
    expect(d.counts.same).toBe(2)
    expect(d.identical).toBe(false)
  })

  it('מזהה דור שהמשפחה מוסיפה בסוף', () => {
    const cur = [row(1, 'א'), row(2, 'ב')]
    const pro = [row(1, 'א'), row(2, 'ב'), row(3, 'ג')]
    const d = diffChains(cur, pro)
    expect(d.counts.added).toBe(1)
    expect(d.rows.find(r => r.generation === 3)?.op).toBe('added')
    expect(d.rows.find(r => r.generation === 3)?.current).toBeNull()
  })

  it('מזהה דור שהמשפחה מסירה', () => {
    const cur = [row(1, 'א'), row(2, 'ב'), row(3, 'ג')]
    const pro = [row(1, 'א'), row(2, 'ב')]
    const d = diffChains(cur, pro)
    expect(d.counts.removed).toBe(1)
    expect(d.rows.find(r => r.generation === 3)?.op).toBe('removed')
    expect(d.rows.find(r => r.generation === 3)?.proposed).toBeNull()
  })

  it('הבדלי כתיב בלבד נחשבים זהים', () => {
    const cur = [row(1, 'רבי יו"ט  שישא')]
    const pro = [row(1, 'רבי יו״ט שישא')]
    expect(diffChains(cur, pro).identical).toBe(true)
  })

  it('שינוי יחס בן↔חתן נחשב הבדל גם כששם זהה', () => {
    const cur = [row(5, 'רבי שלמה שפירא', 'son')]
    const pro = [row(5, 'רבי שלמה שפירא', 'son_in_law')]
    const d = diffChains(cur, pro)
    expect(d.identical).toBe(false)
    expect(d.rows[0].relationChanged).toBe(true)
    expect(d.rows[0].op).toBe('changed')
  })

  it('⚠️ יחס חסר אצלנו אינו נחשב שינוי', () => {
    // אחרת כל שרשרת ותיקה (בלי יחס מתועד) הייתה נצבעת כולה כשגויה.
    const cur = [row(5, 'רבי שלמה שפירא', null)]
    const pro = [row(5, 'רבי שלמה שפירא', 'son')]
    const d = diffChains(cur, pro)
    expect(d.identical).toBe(true)
    expect(d.rows[0].relationChanged).toBe(false)
  })

  it('שרשרת רשומה ריקה — הכול "נוסף"', () => {
    const d = diffChains([], [row(1, 'א'), row(2, 'ב')])
    expect(d.counts.added).toBe(2)
    expect(d.firstDivergence).toBe(1)
  })
})

describe('parseChainText — הפורמט שהמערכת מייצרת', () => {
  const real = `בקשת תיקון סדר הדורות מהאזור האישי — ליבוביץ שלמה:

דור 1: רבינו החתם סופר
דור 2: מרת גיטל קורניצר / שפיצר
דור 3: רבי עקיבא ומרת רייזל קורניצר (בן)
דור 5: רבי שלמה ומרת חיה שרה שפירא (חתן)

הערת המבקש:
מרת רייזל קורניצר היא ביתו של הרב שמעון סופר`

  it('מפענח דורות, שמות ויחסים', () => {
    const c = parseChainText(real)
    expect(c).toHaveLength(4)
    expect(c[0]).toEqual({ generation: 1, name: 'רבינו החתם סופר', relation: null })
    expect(c[2]).toEqual({ generation: 3, name: 'רבי עקיבא ומרת רייזל קורניצר', relation: 'son' })
    expect(c[3].relation).toBe('son_in_law')
  })

  it('שומר על שם שמכיל לוכסן', () => {
    expect(parseChainText(real)[1].name).toBe('מרת גיטל קורניצר / שפיצר')
  })

  it('מתעלם משורות שאינן דור', () => {
    expect(parseChainText('שלום\nבלי דורות כאן')).toEqual([])
  })

  it('מתעלם מדור כפול (ציטוט בהערה)', () => {
    const c = parseChainText('דור 1: א\nדור 1: ב')
    expect(c).toHaveLength(1)
    expect(c[0].name).toBe('א')
  })

  it('חילוץ הערת המבקש ושמו', () => {
    expect(extractRequesterNote({ text: real })).toContain('ביתו של הרב שמעון סופר')
    expect(extractRequesterName({ text: real })).toBe('ליבוביץ שלמה')
    expect(extractRequesterNote({ text: 'דור 1: א' })).toBeNull()
  })
})

describe('extractProposedChain', () => {
  it('מעדיף את המערך המובנה על הטקסט', () => {
    const c = extractProposedChain({
      chain: [{ generation: 1, name: 'מהמערך', relation: null }],
      text: 'דור 1: מהטקסט',
    })
    expect(c[0].name).toBe('מהמערך')
  })

  it('נופל לטקסט כשאין מערך', () => {
    expect(extractProposedChain({ text: 'דור 1: מהטקסט' })[0].name).toBe('מהטקסט')
  })

  it('מערך ריק/פגום → נופל לטקסט', () => {
    expect(extractProposedChain({ chain: [], text: 'דור 1: גיבוי' })[0].name).toBe('גיבוי')
    expect(extractProposedChain(null)).toEqual([])
  })
})

describe('husbandName — 79% מהצמתים כתובים "רבי X ומרת Y"', () => {
  it('מסיר את חלק האישה ואת התואר', () => {
    expect(husbandName('רבי עקיבא ומרת רייזל קורניצר')).toBe('עקיבא קורניצר')
    expect(husbandName('רבי עקיבא קורניצר')).toBe('עקיבא קורניצר')
  })

  it('מסיר הערה בסוגריים', () => {
    expect(husbandName('רבי עקיבא ומרת רייזל קורניצר (שהוא גם נכד מרן החת"ס)'))
      .toBe('עקיבא קורניצר')
  })

  it('שני הניסוחים של אותו אדם מתלכדים', () => {
    expect(husbandName('רבי עקיבא ומרת רייזל קורניצר'))
      .toBe(husbandName('רבי עקיבא קורניצר'))
  })

  it('אינו ממזג אנשים שונים', () => {
    expect(husbandName('רבי משה ומרת שרה קורניצר'))
      .not.toBe(husbandName('רבי משה ומרת שרה סופר'))
  })
})

describe('matchChild — לעולם לא מנחש', () => {
  const n = (name: string) => ({ name })

  it('התאמה מלאה', () => {
    const r = matchChild([n('רבי עקיבא קורניצר'), n('רבי משה סופר')], 'רבי עקיבא קורניצר')
    expect(r.how).toBe('exact')
    expect(r.node?.name).toBe('רבי עקיבא קורניצר')
  })

  it('התאמה לפי שם הבעל כשהמשפחה כתבה גם את האישה', () => {
    const r = matchChild([n('רבי עקיבא קורניצר')], 'רבי עקיבא ומרת רייזל קורניצר')
    expect(r.how).toBe('husband')
    expect(r.node?.name).toBe('רבי עקיבא קורניצר')
  })

  it('🔴 שני מועמדים לפי שם הבעל → ambiguous, בלי בחירה אוטומטית', () => {
    // המקרה האמיתי בעץ: אותו אדם רשום פעמיים בשני ניסוחים, ושניהם ילדי
    // אותו אב. בחירה שרירותית הייתה מצמידה את המשפחה לצומת הלא-נכון.
    const r = matchChild(
      [n('רבי עקיבא קורניצר'), n('רבי עקיבא ומרת חנה קורניצר')],
      'רבי עקיבא ומרת רייזל קורניצר',
    )
    expect(r.how).toBe('ambiguous')
    expect(r.node).toBeNull()
    expect(r.candidates).toHaveLength(2)
  })

  it('🔴 כפילות אמיתית (שם מלא זהה פעמיים) גם היא ambiguous', () => {
    const r = matchChild([n('רבי משה סופר'), n('רבי משה סופר')], 'רבי משה סופר')
    expect(r.how).toBe('ambiguous')
    expect(r.node).toBeNull()
  })

  it('אין התאמה כלל', () => {
    expect(matchChild([n('רבי משה סופר')], 'רבי אלמוני פלוני').how).toBe('none')
  })

  it('רשימה ריקה', () => {
    expect(matchChild([], 'רבי משה').how).toBe('none')
  })
})
