import { describe, it, expect } from 'vitest'
import { nextCenterStep } from './holidayCenterIvr'
import type { CenterRow } from './holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 זרימת בחירת המוקד אחרי המעבר לתפריט ערים ממוספר.
//
// עד כה השלב הראשון היה *אזור* (ירושלים והסביבה / מרכז / צפון / דרום).
// עם הרשימה האמיתית — 18 ערים, מהן 15 עם מוקד יחיד — השכבה הזו הוסיפה
// הקשה מיותרת לרוב המתקשרים בלי שום תועלת.
//
// 🔴 המספר קבוע לעיר (sort_order) ומתפרסם מראש. הקשה 7 מגיעה לביתר עילית
// גם אם היא השביעית או השנייה ברשימה — אחרת סגירת עיר אחת הייתה מזיזה
// את כל המספרים, ומי שיודע את המספר שלו היה מגיע למוקד של עיר אחרת.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, city: string, name: string, sort_order: number): CenterRow =>
  ({ id, city, name, region: 'center', sort_order })

// מדגם מהרשימה האמיתית
const CENTERS: CenterRow[] = [
  c('j1', 'ירושלים', 'אזור נווה צבי', 1),
  c('j2', 'ירושלים', 'אזור שמואל הנביא', 1),
  c('b1', 'בני ברק', 'אזור סקולוב', 2),
  c('b2', 'בני ברק', 'אזור ויז׳ניץ', 2),
  c('e1', 'ביתר עילית', 'ביתר עילית', 7),
  c('r1', 'רכסים', 'רכסים', 18),
]

const base = {
  centers: CENTERS,
  taken: {} as Record<string, number>,
  capacities: {} as Record<string, number | null>,
  currentCenterId: null as string | null,
  centersOpen: true,
  tapped: {} as { region?: string; city?: string; center?: string; confirm?: string },
}

describe('🔴 השלב הראשון הוא עיר, לא אזור', () => {
  it('בלי הקשות — נשאלת העיר', () => {
    expect(nextCenterStep(base).kind).toBe('ask_city')
  })

  it('הרשימה כוללת את כל הערים, כל אחת פעם אחת', () => {
    const s = nextCenterStep(base)
    if (s.kind !== 'ask_city') throw new Error('ציפינו ל-ask_city')
    expect(s.options.map(o => o.city)).toEqual(['ירושלים', 'בני ברק', 'ביתר עילית', 'רכסים'])
  })
})

describe('🔴 ההקשה היא מספר העיר ולא מיקום ברשימה', () => {
  it('הקשה 7 מגיעה לביתר עילית — עיר יחידה, ישר לאישור', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '7' } })
    expect(s.kind).toBe('confirm')
    if (s.kind === 'confirm') expect(s.center.id).toBe('e1')
  })

  it('הקשה 18 מגיעה לרכסים, למרות שהיא הרביעית ברשימה', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '18' } })
    if (s.kind === 'confirm') expect(s.center.city).toBe('רכסים')
    else throw new Error('ציפינו ל-confirm')
  })

  it('⚠️ מספר שאינו קיים חוזר לשאלה ולא בוחר עיר שרירותית', () => {
    expect(nextCenterStep({ ...base, tapped: { city: '9' } }).kind).toBe('ask_city')
    expect(nextCenterStep({ ...base, tapped: { city: '0' } }).kind).toBe('ask_city')
  })
})

describe('עיר עם כמה מוקדים — תת תפריט', () => {
  it('🔴 הקשה 1 (ירושלים) פותחת את רשימת המוקדים בעיר', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '1' } })
    expect(s.kind).toBe('ask_center')
    if (s.kind === 'ask_center') {
      expect(s.city).toBe('ירושלים')
      expect(s.options.map(o => o.id)).toEqual(['j1', 'j2'])
    }
  })

  it('בחירת המוקד בתת התפריט מגיעה לאישור', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '1', center: '2' } })
    if (s.kind === 'confirm') expect(s.center.id).toBe('j2')
    else throw new Error('ציפינו ל-confirm')
  })

  it('⚠️ בתת התפריט ההקשה *כן* לפי מיקום — המוקדים אינם ממוספרים מראש', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '2', center: '1' } })
    if (s.kind === 'confirm') expect(s.center.id).toBe('b1')
    else throw new Error('ציפינו ל-confirm')
  })
})

describe('שאר הזרימה נשמרת', () => {
  it('אישור בהקשה 1 שומר', () => {
    const s = nextCenterStep({ ...base, tapped: { city: '7', confirm: '1' } })
    expect(s.kind).toBe('save')
  })

  it('הקשה אחרת מבטלת', () => {
    expect(nextCenterStep({ ...base, tapped: { city: '7', confirm: '2' } }).kind).toBe('cancelled')
  })

  it('🔴 מי שכבר בחר אינו מקבל תפריט', () => {
    const s = nextCenterStep({ ...base, currentCenterId: 'j1' })
    expect(s.kind).toBe('already')
  })

  it('מוקד מלא נחסם', () => {
    const s = nextCenterStep({
      ...base, tapped: { city: '7' },
      capacities: { e1: 5 }, taken: { e1: 5 },
    })
    expect(s.kind).toBe('full')
  })

  it('מתג סגור עוצר לפני הכול', () => {
    expect(nextCenterStep({ ...base, centersOpen: false }).kind).toBe('closed')
  })
})
