import { describe, it, expect } from 'vitest'
import { citiesByNumber, cityMenuText, findCityByNumber } from './holidayCityMenu'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תפריט הערים בשלוחה — לפי מספרי העיר שנקבעו מראש.
//
// ⚠️ המספר אינו מיקום ברשימה אלא ערך *קבוע* לכל עיר (sort_order), שנקבע
// ברשימת המוקדים ואפשר לפרסם אותו מראש. אילו היה נגזר מהמיקום, סגירת
// עיר אחת הייתה מזיזה את כל המספרים שאחריה — והמשפחות שכבר יודעות
// "אלעד זה 7" היו מגיעות למוקד אחר.
//
// ⚠️ הנתונים בטסטים הם מהרשימה האמיתית (26 מוקדים ב-18 ערים).
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, city: string, name: string, sort_order: number) =>
  ({ id, city, name, region: 'center', sort_order })

// מדגם מייצג: ירושלים (5 מוקדים), בני ברק (4), בית שמש (2), אלעד (1)
const CENTERS = [
  c('j1', 'ירושלים', 'אזור נווה צבי', 1),
  c('j2', 'ירושלים', 'אזור שמואל הנביא', 1),
  c('j3', 'ירושלים', 'אזור מאה שערים', 1),
  c('b1', 'בני ברק', 'אזור סקולוב', 2),
  c('b2', 'בני ברק', 'אזור ויז׳ניץ', 2),
  c('s1', 'בית שמש', 'רמה ב׳', 3),
  c('s2', 'בית שמש', 'רמה ד׳', 3),
  c('e1', 'אלעד', '', 7),
]

describe('citiesByNumber — קיבוץ לפי מספר העיר', () => {
  it('כל עיר מופיעה פעם אחת, עם המוקדים שלה', () => {
    const cities = citiesByNumber(CENTERS)
    expect(cities.map(x => x.city)).toEqual(['ירושלים', 'בני ברק', 'בית שמש', 'אלעד'])
    expect(cities[0].centers).toHaveLength(3)
    expect(cities[3].centers).toHaveLength(1)
  })

  it('🔴 המספר נשמר מהנתונים ואינו מיקום ברשימה', () => {
    const cities = citiesByNumber(CENTERS)
    expect(cities.find(x => x.city === 'אלעד')?.number).toBe(7)
  })

  it('⚠️ ממוין לפי המספר — כדי שההקראה תהיה 1,2,3 ולא אקראית', () => {
    const shuffled = [CENTERS[7], CENTERS[5], CENTERS[0]]
    expect(citiesByNumber(shuffled).map(x => x.number)).toEqual([1, 3, 7])
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(citiesByNumber([])).toEqual([])
  })
})

describe('findCityByNumber — 🔴 ההקשה מוצאת את העיר הנכונה', () => {
  it('הקשה 7 מגיעה לאלעד ולא לעיר השביעית ברשימה', () => {
    // ⚠️ זה הלב: אלעד היא הרביעית ברשימה אך מספרה 7.
    expect(findCityByNumber(CENTERS, '7')?.city).toBe('אלעד')
  })

  it('הקשה 1 מגיעה לירושלים', () => {
    expect(findCityByNumber(CENTERS, '1')?.city).toBe('ירושלים')
  })

  it('מספר שאינו קיים → null, ולא העיר הראשונה', () => {
    expect(findCityByNumber(CENTERS, '9')).toBeNull()
    expect(findCityByNumber(CENTERS, '')).toBeNull()
    expect(findCityByNumber(CENTERS, 'abc')).toBeNull()
  })

  it('⚠️ אפס אינו עיר — הקשה שגויה ולא ברירת מחדל', () => {
    expect(findCityByNumber(CENTERS, '0')).toBeNull()
  })
})

describe('cityMenuText — נוסח ההקראה', () => {
  it('מקריא כל עיר עם המספר שלה', () => {
    const txt = cityMenuText(citiesByNumber(CENTERS))
    expect(txt).toContain('לירושלים הקישו 1')
    expect(txt).toContain('לאלעד הקישו 7')
  })

  it('⚠️ הסדר בהקראה עולה', () => {
    const txt = cityMenuText(citiesByNumber(CENTERS))
    expect(txt.indexOf('לירושלים')).toBeLessThan(txt.indexOf('לאלעד'))
  })
})
