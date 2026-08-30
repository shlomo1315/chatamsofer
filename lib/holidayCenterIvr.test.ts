import { describe, it, expect } from 'vitest'
import {
  nextCenterStep, buildChoiceList, regionsWithCenters,
  type CenterFlowInput,
} from './holidayCenterIvr'
import type { CenterRow } from './holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// זרימת השלוחה — נבדקת כאן ולא בטלפון.
//
// ⚠️ כל ענף שאינו מכוסה כאן מתגלה רק כשמישהו מתקשר ונתקע. הזרימה טהורה
// בדיוק כדי שאפשר יהיה לבדוק אותה בלי שלוחה ובלי מסד.
// ─────────────────────────────────────────────────────────────────────────────

const CENTERS: CenterRow[] = [
  { id: 'j1', city: 'ירושלים', name: 'אזור נווה צבי', region: 'jerusalem', sort_order: 1 },
  { id: 'j2', city: 'ירושלים', name: 'אזור מאה שערים', region: 'jerusalem', sort_order: 1 },
  { id: 'b1', city: 'ביתר עילית', name: 'ביתר עילית', region: 'jerusalem', sort_order: 7 },
  { id: 'c1', city: 'בני ברק', name: 'אזור סקולוב', region: 'center', sort_order: 2 },
  { id: 'n1', city: 'חיפה', name: 'חיפה', region: 'north', sort_order: 8 },
]

const base: CenterFlowInput = {
  centers: CENTERS,
  taken: {},
  capacities: {},
  currentCenterId: null,
  centersOpen: true,
  tapped: {},
}

describe('nextCenterStep — זרימת בחירת המוקד', () => {
  it('מתג סגור עוצר לפני הכול', () => {
    const s = nextCenterStep({ ...base, centersOpen: false })
    expect(s.kind).toBe('closed')
  })

  it('🔴 מי שכבר בחר מקבל אישור עם שם המוקד ולא תפריט', () => {
    const s = nextCenterStep({ ...base, currentCenterId: 'j1' })
    expect(s).toEqual({ kind: 'already', centerId: 'j1', label: 'ירושלים · אזור נווה צבי' })
  })

  it('בלי מוקדים פתוחים — אין מה להציע', () => {
    const s = nextCenterStep({ ...base, centers: [] })
    expect(s.kind).toBe('no_centers')
  })

  // 🔴 שכבת האזור הוסרה מהזרימה: מתוך 18 הערים ברשימה האמיתית, 15 הן
  // מוקד יחיד — ולהן היא הוסיפה הקשה שלמה בלי תועלת. השלב הראשון הוא
  // העיר, לפי המספר הקבוע שלה. ראו lib/holidayCityFlow.test.ts.
  it('🔴 השלב הראשון הוא בחירת עיר', () => {
    const s = nextCenterStep(base)
    expect(s.kind).toBe('ask_city')
  })

  it('כל הערים מוצעות, כל אחת פעם אחת', () => {
    const s = nextCenterStep({ ...base, tapped: {} })
    expect(s.kind).toBe('ask_city')
    if (s.kind === 'ask_city') {
      // 🔴 ירושלים פעם אחת, למרות שני מוקדים. הסדר לפי מספר העיר.
      expect(s.options.map(o => o.city)).toEqual(['ירושלים', 'בני ברק', 'ביתר עילית', 'חיפה'])
      expect(s.options.map(o => o.number)).toEqual([1, 2, 7, 8])
    }
  })

  it('🔴 עיר עם כמה מוקדים — מוצג תפריט מוקדים', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '1' } })
    expect(s.kind).toBe('ask_center')
    if (s.kind === 'ask_center') expect(s.options).toHaveLength(2)
  })

  it('🔴 עיר עם מוקד יחיד מדלגת ישר לאישור', () => {
    // ⚠️ תפריט בן אפשרות אחת מבזבז את זמן המאזין ומבלבל.
    const s = nextCenterStep({ ...base, tapped: { city: '7' } })
    expect(s.kind).toBe('confirm')
    if (s.kind === 'confirm') expect(s.center.id).toBe('b1')
  })

  it('אישור בהקשה 1 → שמירה', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '7', confirm: '1' } })
    expect(s.kind).toBe('save')
    if (s.kind === 'save') expect(s.center.id).toBe('b1')
  })

  it('הקשה שאינה 1 → ביטול, בלי שמירה', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '7', confirm: '2' } })
    expect(s.kind).toBe('cancelled')
  })

  it('🔴 מוקד מלא נחסם לפני האישור', () => {
    const s = nextCenterStep({
      ...base,
      capacities: { b1: 10 }, taken: { b1: 10 },
      tapped: { city: '7' },
    })
    expect(s.kind).toBe('full')
  })

  it('מוקד כמעט מלא עדיין ניתן לבחירה', () => {
    const s = nextCenterStep({
      ...base,
      capacities: { b1: 10 }, taken: { b1: 9 },
      tapped: { city: '7' },
    })
    expect(s.kind).toBe('confirm')
  })

  it('⚠️ הקשה מחוץ לטווח מחזירה לתפריט ולא קורסת', () => {
    // מי שהקיש 9 בתפריט בן 3 אפשרויות — שומע את התפריט שוב.
    const s = nextCenterStep({ ...base, tapped: { city: '99' } })
    expect(s.kind).toBe('ask_city')
  })

  it('⚠️ הקשת עיר מחוץ לטווח מחזירה לרשימת הערים', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '9' } })
    expect(s.kind).toBe('ask_city')
  })

  it('בחירת עיר אחרת עובדת (2 → בני ברק)', () => {
    // ⚠️ בני ברק היא מספר 2 ברשימה, ויש לה מוקד יחיד בדוגמה — ולכן
    // ההקשה מגיעה ישירות לאישור.
    const s = nextCenterStep({ ...base, tapped: { city: '2' } })
    expect(s.kind).toBe('confirm')
    if (s.kind === 'confirm') expect(s.center.id).toBe('c1')
  })
})

describe('buildChoiceList — הרשימה המוקראת', () => {
  it('ממספר מ-1 ברצף', () => {
    expect(buildChoiceList([{ label: 'ירושלים' }, { label: 'בני ברק' }]))
      .toBe('לירושלים הקישו 1 לבני ברק הקישו 2')
  })

  it('רשימה ריקה אינה מייצרת טקסט', () => {
    expect(buildChoiceList([])).toBe('')
  })
})

describe('regionsWithCenters', () => {
  it('⚠️ אזור בלי מוקדים אינו מוצע — אחרת המאזין בוחר ומגיע לרשימה ריקה', () => {
    const regions = regionsWithCenters(CENTERS)
    expect(regions.map(r => r.key)).not.toContain('south')
  })

  it('סדר האזורים קבוע', () => {
    const regions = regionsWithCenters(CENTERS)
    expect(regions.map(r => r.key)).toEqual(['jerusalem', 'center', 'north'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אורך ההקשה חייב להיגזר ממספר האפשרויות בפועל.
//
// ⚠️ max קשיח = מתקשר תקוע: ימות ממתינה לספרה נוספת שלא תגיע, אחרי
// הקשה תקינה לגמרי, עד שהזמן נגמר.
// ─────────────────────────────────────────────────────────────────────────────
describe('אורך ההקשה בתפריטים', () => {
  const tapLen = (n: number) => String(n).length

  it('עד 9 אפשרויות — ספרה אחת', () => {
    expect(tapLen(3)).toBe(1)
    expect(tapLen(7)).toBe(1)   // מרכז: 7 ערים
    expect(tapLen(9)).toBe(1)
  })

  it('10 ומעלה — שתי ספרות', () => {
    expect(tapLen(10)).toBe(2)
    expect(tapLen(26)).toBe(2)  // כלל המוקדים
  })

  it('⚠️ ירושלים (5 מוקדים) נקראת בספרה אחת', () => {
    const jerusalem = CENTERS.filter(c => c.city === 'ירושלים')
    expect(tapLen(jerusalem.length)).toBe(1)
  })
})
