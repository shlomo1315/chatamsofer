import { describe, it, expect } from 'vitest'
import { mergeSavedVisibility, toSavedVisibility } from './tableColumnVisibility'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 עמודה חדשה מול בחירה שמורה.
//
// בחירת העמודות נשמרת ב-localStorage כרשימת מפתחות. כשנוספת עמודה חדשה
// לקוד, היא אינה קיימת ברשימה השמורה — וטעינה שדורסת את ברירת המחדל
// ברשימה הזו מסתירה אותה מכל מי שאי פעם נגע בבורר. הפיצ'ר נראה כאילו
// לא נפרס, והמשתמש אינו יודע שעליו לחפש אותו בבורר.
//
// ⚠️ ההבחנה: עמודה *חדשה* (שלא הייתה קיימת בזמן השמירה) נכנסת לפי
// ברירת המחדל שלה. עמודה שהמשתמש *הסתיר במפורש* נשארת מוסתרת — אחרת
// כל הוספה עתידית הייתה מבטלת את הכיוונון שלו.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = [
  { key: 'a', def: true },
  { key: 'b', def: true },
  { key: 'c', def: false },
]

describe('mergeSavedVisibility — אין בחירה שמורה', () => {
  it('null → ברירות המחדל', () => {
    expect(mergeSavedVisibility(COLS, null)).toEqual(new Set(['a', 'b']))
  })

  it('רשימה ריקה נשמרת כפי שהיא — המשתמש הסתיר הכל', () => {
    expect(mergeSavedVisibility(COLS, [])).toEqual(new Set())
  })
})

describe('mergeSavedVisibility — 🔴 עמודה חדשה', () => {
  it('עמודה חדשה שברירת המחדל שלה true נכנסת לבחירה שמורה', () => {
    // המשתמש שמר [a] כשעדיין לא היו b ו-c בקוד.
    const saved = ['a']
    const cols = [...COLS, { key: 'new', def: true }]
    expect(mergeSavedVisibility(cols, saved).has('new')).toBe(true)
  })

  it('עמודה חדשה שברירת המחדל שלה false אינה נכנסת', () => {
    const cols = [...COLS, { key: 'opt', def: false }]
    expect(mergeSavedVisibility(cols, ['a']).has('opt')).toBe(false)
  })
})

describe('mergeSavedVisibility — ⚠️ בחירת המשתמש נשמרת', () => {
  it('🔴 עמודה שהוסתרה במפורש נשארת מוסתרת — known מבדיל אותה מחדשה', () => {
    // 'b' הייתה קיימת בזמן השמירה (known) והמשתמש הסיר אותה מ-visible.
    const saved = { visible: ['a'], known: ['a', 'b', 'c'] }
    expect(mergeSavedVisibility(COLS, saved).has('b')).toBe(false)
  })

  it('🔴 ובאותה שמירה בדיוק — עמודה חדשה כן נכנסת', () => {
    // אותו saved, אבל 'new' לא הייתה קיימת אז. זו ההבחנה שרשימה
    // שטוחה לא מאפשרת, וכל הטעם ב-known.
    const saved = { visible: ['a'], known: ['a', 'b', 'c'] }
    const cols = [...COLS, { key: 'new', def: true }]
    const out = mergeSavedVisibility(cols, saved)
    expect(out.has('new')).toBe(true)
    expect(out.has('b')).toBe(false)
  })

  it('עמודה שהמשתמש הוסיף למרות def:false נשארת מוצגת', () => {
    expect(mergeSavedVisibility(COLS, { visible: ['a', 'c'], known: ['a', 'b', 'c'] }).has('c')).toBe(true)
  })

  it('מפתח שנשמר ואינו קיים עוד בקוד — נזרק', () => {
    const saved = { visible: ['a', 'gone'], known: ['a', 'b', 'c', 'gone'] }
    expect(mergeSavedVisibility(COLS, saved).has('gone' as never)).toBe(false)
  })
})

describe('mergeSavedVisibility — תאימות לאחור לפורמט הישן', () => {
  it('⚠️ מערך שטוח: עמודה חדשה מוצגת — עדיף שיסירו מאשר שלא יידעו', () => {
    const cols = [...COLS, { key: 'new', def: true }]
    expect(mergeSavedVisibility(cols, ['a']).has('new')).toBe(true)
  })

  it('מערך ריק נשמר כפי שהוא', () => {
    expect(mergeSavedVisibility(COLS, [])).toEqual(new Set())
  })
})

describe('toSavedVisibility — שומר את שני החלקים', () => {
  it('known הוא כל המפתחות שבקוד עכשיו', () => {
    const out = toSavedVisibility(COLS, new Set(['a'] as const))
    expect(out).toEqual({ visible: ['a'], known: ['a', 'b', 'c'] })
  })
})
