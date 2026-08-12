import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows, type PageResult } from './fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ המנגנון הזה קיים כדי שרשימות לא ייחתכו בשקט ב-1,000 שורות. הוא נשלף
// מקבילית מטעמי מהירות, ולכן הבדיקות כאן נעולות על מה שאסור שהמקביליות
// תשבור: הסדר, נקודת הסיום, והשורות שמעבר לה.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = 1000

/** מקור בגודל נתון — מחזיר בדיוק את הפרוסה המבוקשת, כמו PostgREST. */
function source(total: number) {
  const calls: [number, number][] = []
  const fn = (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to])
    const data = Array.from(
      { length: Math.max(0, Math.min(to + 1, total) - from) },
      (_, i) => from + i,
    )
    return Promise.resolve({ data, error: null })
  }
  return { fn, calls }
}

describe('fetchAllRows — שלמות הרשימה', () => {
  it('רשימה קצרה מדף אחד', async () => {
    const { fn } = source(42)
    const { rows, error } = await fetchAllRows(fn)
    expect(error).toBeNull()
    expect(rows).toHaveLength(42)
  })

  it('רשימה ריקה', async () => {
    const { rows, error } = await fetchAllRows(source(0).fn)
    expect(error).toBeNull()
    expect(rows).toEqual([])
  })

  it('🔴 מעבר לתקרת 1,000 — זו כל מטרת המנגנון', async () => {
    const { rows } = await fetchAllRows(source(2500).fn)
    expect(rows).toHaveLength(2500)
  })

  it('🔴 ~6,000 שורות (חלוקת חגים אמיתית) נשלפות במלואן', async () => {
    const { rows } = await fetchAllRows(source(5965).fn)
    expect(rows).toHaveLength(5965)
  })

  it('🔴 הסדר נשמר למרות השליפה המקבילה', async () => {
    // המקביליות היא פנימית בלבד. אם הסדר היה משתנה, הטבלה הייתה מוצגת
    // בסדר אקראי במקום לפי מועד הרישום.
    const { rows } = await fetchAllRows(source(3210).fn)
    expect(rows).toEqual(Array.from({ length: 3210 }, (_, i) => i))
  })

  it('🔴 גודל שהוא כפולה מדויקת של הדף אינו מאבד ואינו מכפיל', async () => {
    // המקרה הגבולי: הדף האחרון מלא, ולכן הסוף מזוהה רק בדף הריק שאחריו.
    for (const total of [PAGE, PAGE * 2, PAGE * 5]) {
      const { rows } = await fetchAllRows(source(total).fn)
      expect(rows).toHaveLength(total)
    }
  })
})

describe('🔴 fetchAllRows — מה שהמקביליות אסור שתשבור', () => {
  it('אינו מחזיר שורות מעבר לדף החלקי', async () => {
    // דף חלקי = סוף הנתונים. שליפה מקבילה מביאה גם דפים שאחריו, והם
    // חייבים להיזרק — אחרת הרשימה הייתה מכילה שורות שאינן קיימות.
    const { rows } = await fetchAllRows(source(1500).fn)
    expect(rows).toHaveLength(1500)
    expect(rows[rows.length - 1]).toBe(1499)
  })

  it('שגיאה בדף כלשהו מוחזרת ואינה נבלעת', async () => {
    const fn = (from: number): Promise<PageResult<number>> =>
      Promise.resolve(from === 0
        ? { data: Array.from({ length: PAGE }, (_, i) => i), error: null }
        : { data: null, error: { message: 'boom' } })
    const { error } = await fetchAllRows(fn)
    expect(error).toBe('boom')
  })

  it('data=null אינו מפיל ונחשב סוף', async () => {
    const fn = (): Promise<PageResult<number>> => Promise.resolve({ data: null, error: null })
    const { rows, error } = await fetchAllRows(fn)
    expect(error).toBeNull()
    expect(rows).toEqual([])
  })
})

describe('fetchAllRows — מקביליות בפועל', () => {
  it('🔴 שולף דפים במקביל ולא אחד-אחרי-השני', async () => {
    // זו כל מטרת השינוי: אם הדפים נשלפים טורית, זמן הטעינה הוא סכום כולם.
    let inFlight = 0
    let peak = 0
    const fn = async (from: number, to: number): Promise<PageResult<number>> => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 1))
      inFlight--
      const data = Array.from({ length: Math.max(0, Math.min(to + 1, 4500) - from) }, (_, i) => from + i)
      return { data, error: null }
    }
    await fetchAllRows(fn)
    expect(peak).toBeGreaterThan(1)
  })

  it('אינו יורה בקשות מיותרות על רשימה קטנה', async () => {
    // מסך קטן לא צריך לשלם במאות שאילתות. סבב אחד מספיק כדי לגלות שהסתיים.
    const { fn, calls } = source(50)
    await fetchAllRows(fn)
    expect(calls.length).toBeLessThanOrEqual(5)
  })
})
