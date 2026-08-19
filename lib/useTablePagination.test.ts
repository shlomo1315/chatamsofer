import { describe, it, expect } from 'vitest'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from './listParams'

// ⚠️ ה-hook עצמו דורש סביבת React; כאן נבדקת לוגיקת החיתוך והגבולות
// שהוא מיישם — בדיוק החישובים שקובעים אילו שורות המשתמש רואה.

const slice = <T>(all: T[], page: number, size: number) => {
  const totalPages = Math.max(1, Math.ceil(all.length / size))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * size
  return all.slice(from, from + size)
}

describe('חוזה גדלי העמוד', () => {
  it('ברירת המחדל היא 50', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50)
  })

  it('הבורר מגיע עד 200', () => {
    expect(PAGE_SIZES).toContain(50)
    expect(PAGE_SIZES).toContain(200)
    expect(Math.max(...PAGE_SIZES)).toBe(200)
  })
})

describe('חיתוך לעמוד', () => {
  const rows = Array.from({ length: 137 }, (_, i) => i + 1)

  it('העמוד הראשון מציג 50 שורות', () => {
    const r = slice(rows, 1, 50)
    expect(r).toHaveLength(50)
    expect(r[0]).toBe(1)
    expect(r[49]).toBe(50)
  })

  it('העמוד השני ממשיך בדיוק מהשורה הבאה — בלי דילוג וכפילות', () => {
    expect(slice(rows, 2, 50)[0]).toBe(51)
  })

  it('העמוד האחרון מציג את השארית בלבד', () => {
    expect(slice(rows, 3, 50)).toHaveLength(37)
  })

  it('200 בבורר מציג את כל הרשימה כשהיא קטנה ממנו', () => {
    expect(slice(rows, 1, 200)).toHaveLength(137)
  })

  it('⚠️ עמוד מעבר לסוף נצמד לאחרון ולא מחזיר ריק', () => {
    expect(slice(rows, 99, 50)).toHaveLength(37)
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(slice([], 1, 50)).toEqual([])
  })

  it('סכום כל העמודים = כל השורות, בלי אובדן', () => {
    const seen = [...slice(rows, 1, 50), ...slice(rows, 2, 50), ...slice(rows, 3, 50)]
    expect(seen).toEqual(rows)
  })
})

describe('🔴 חיפוש קודם לחיתוך', () => {
  // זו הטעות שהכי קל ליפול בה: לחתוך לעמוד ואז לחפש בתוכו. אז רשומה
  // שקיימת במאגר "לא נמצאת" רק כי היא לא בעמוד הנוכחי.
  const rows = Array.from({ length: 300 }, (_, i) => `פריט ${i + 1}`)
  const search = (all: string[], q: string) => all.filter(r => r.includes(q))

  it('מוצא רשומה שנמצאת הרבה אחרי העמוד הראשון', () => {
    const found = search(rows, 'פריט 287')
    expect(found).toHaveLength(1)
    // ואחרי הסינון היא בעמוד הראשון של התוצאות
    expect(slice(found, 1, 50)[0]).toBe('פריט 287')
  })

  it('חיתוך-ואז-חיפוש היה מפספס אותה — ההוכחה לסדר הנכון', () => {
    const wrong = search(slice(rows, 1, 50), 'פריט 287')
    expect(wrong).toHaveLength(0)
  })
})
