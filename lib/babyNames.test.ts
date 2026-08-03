import { describe, it, expect } from 'vitest'
import { babiesOf, babyNameLabel, babyRealName, isNamePending, babyNamePatch, NO_NAME_YET } from './babyNames'

// ─────────────────────────────────────────────────────────────────────────────
// המקרה מהשטח (אייזנער חוה רחל) שהבדיקות האלה שומרות עליו:
// בכרטסת נכתב "עדיין אין שם" (המערך ריק), ובאותו רגע ברשימה ובבית ההחלמה הופיע
// הטקסט הישן שנשאר בשדה `baby_name` — והוא זה שנשלח לבית ההחלמה.
// ─────────────────────────────────────────────────────────────────────────────

describe('שם התינוק — מקור אמת אחד', () => {
  it('דגל "אין שם" דלוק וטקסט ישן בשדה → מוצג "עדיין אין שם", לא הטקסט', () => {
    const aid = {
      baby_name: 'הברית אמור להערך ביום א הקרוב ב"ה',
      baby_name_pending: true,
      babies: [{ name: null, gender: 'male', id_number: '246323422' }],
    }
    const label = babyNameLabel(aid)
    expect(label.pending).toBe(true)
    expect(label.text).toBe(NO_NAME_YET)
    expect(babyRealName(aid)).toBeNull()
  })

  it('שם קיים במערך אך חסר בשדה → השם מוצג', () => {
    const aid = { baby_name: null, baby_name_pending: true, babies: [{ name: 'יעקב' }] }
    expect(babyNameLabel(aid).text).toBe('יעקב')
    // ⚠️ הדגל נשאר דלוק מכתיבה ישנה — אבל יש שם, ולכן אין כאן "ממתין לתיקון"
    expect(isNamePending(aid)).toBe(false)
  })

  it('אין שם ואין דגל → מקף', () => {
    expect(babyNameLabel({ baby_name: null, babies: [] }).missing).toBe(true)
  })

  it('בלי מערך — נופלים לשדות הסקלריים', () => {
    const aid = { baby_name: 'שרה', baby_gender: 'female' }
    expect(babiesOf(aid)).toHaveLength(1)
    expect(babyNameLabel(aid).text).toBe('שרה')
  })

  it('תאומים — שני השמות מוצגים', () => {
    const aid = { is_twins: true, babies: [{ name: 'יעקב' }, { name: 'רחל' }] }
    expect(babyRealName(aid)).toBe('יעקב · רחל')
  })
})

describe('כתיבת שם — שני המקומות יחד', () => {
  it('שם חדש נכתב גם למערך וגם לשדה, והדגל נכבה', () => {
    const aid = { baby_name: null, baby_name_pending: true, babies: [{ name: null, id_number: '1' }] }
    const patch = babyNamePatch(aid, 'יעקב')
    expect(patch.baby_name).toBe('יעקב')
    expect((patch.babies as { name: string }[])[0].name).toBe('יעקב')
    expect(patch.baby_name_pending).toBe(false)
  })

  it('"עדיין אין שם" מרוקן את שני המקומות ומדליק את הדגל', () => {
    // ⚠️ הלב: בלי ריקון *שני* המקומות נשאר טקסט ישן שממשיך להישלח לבית ההחלמה
    const aid = { baby_name: 'טקסט ישן', baby_name_pending: false, babies: [{ name: 'טקסט ישן' }] }
    const patch = babyNamePatch(aid, null)
    expect(patch.baby_name).toBeNull()
    expect((patch.babies as { name: string | null }[])[0].name).toBeNull()
    expect(patch.baby_name_pending).toBe(true)
  })

  it('תאום שני מתעדכן בלי לפגוע בראשון', () => {
    const aid = { is_twins: true, babies: [{ name: 'יעקב' }, { name: null }] }
    const patch = babyNamePatch(aid, 'רחל', 1)
    const babies = patch.babies as { name: string | null }[]
    expect(babies[0].name).toBe('יעקב')
    expect(babies[1].name).toBe('רחל')
    // השדה הסקלרי משקף את התינוק הראשון
    expect(patch.baby_name).toBe('יעקב')
  })

  it('בלי מערך — נכתב השדה הסקלרי בלבד', () => {
    const patch = babyNamePatch({ baby_name: null }, 'משה')
    expect(patch.baby_name).toBe('משה')
    expect(patch.babies).toBeUndefined()
  })
})
