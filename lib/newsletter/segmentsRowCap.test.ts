import { describe, it, expect } from 'vitest'
import { fetchAllRows } from '../fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הרגרסיה: הניוזלטר שלח ל-15% מהרשימה.
//
// resolveSegment שלפה את המוטבים ב-`await q` פשוט. PostgREST חותך ב-1,000
// שורות בלי שגיאה ובלי אזהרה, ולכן הקהל נבנה מ-1,000 מוטבים במקום 7,201.
// אחרי דה-דופליקציה לפי מייל הוצגו 978 נמענים מתוך 6,615 כתובות ייחודיות —
// והמסך הציג את המספר החלקי כאילו הוא המלא.
//
// ⚠️ זה הדפוס שחזר כאן שוב ושוב: .limit() אינו עוקף את התקרה, ורק שליפה
// בדפים דרך range() מחזירה את הרשימה במלואה.
// ─────────────────────────────────────────────────────────────────────────────

/** מדמה את PostgREST: לעולם לא מחזיר יותר מ-1,000 שורות בבקשה אחת. */
function fakeTable(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: String(i), email: `u${i}@x.com` }))
  return {
    all,
    page: (from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null }),
  }
}

describe('🔴 תקרת 1,000 השורות בבניית הקהל', () => {
  it('שליפה בודדת מחזירה 1,000 בלבד — זה היה הבאג', async () => {
    const t = fakeTable(7201)
    const { data } = await t.page(0, 99999)
    expect(data).toHaveLength(1000)
    expect(data.length).toBeLessThan(t.all.length)
  })

  it('fetchAllRows מחזירה את כל 7,201 המוטבים', async () => {
    const t = fakeTable(7201)
    const { rows, error } = await fetchAllRows((from, to) => t.page(from, to))
    expect(error).toBeNull()
    expect(rows).toHaveLength(7201)
  })

  it('רשימה שקטנה מדף אחד אינה נפגעת', async () => {
    const t = fakeTable(37)
    const { rows } = await fetchAllRows((from, to) => t.page(from, to))
    expect(rows).toHaveLength(37)
  })

  it('גבול מדויק — בדיוק 1,000 שורות אינו נקטע ואינו מכפיל', async () => {
    const t = fakeTable(1000)
    const { rows } = await fetchAllRows((from, to) => t.page(from, to))
    expect(rows).toHaveLength(1000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שבא *אחרי* התיקון: 954 במקום 6,615.
//
// אובייקט שאילתה של supabase-js הוא בר-שימוש חד-פעמי. כשבונים אותו פעם
// אחת מחוץ ללולאה וקוראים ל-.range() שוב ושוב, התנאי *מצטבר* במקום
// להתחלף — הדפים אינם דפים, והתוצאה חלקית בלי שום שגיאה.
//
// ⚠️ זה נראה כמו התקרה המקורית ולכן מטעה במיוחד: המספר גדל מעט (978→954
// הוא אפילו ירד) ונראה כאילו "התיקון עבד חלקית". הכלל: פונקציה שבונה
// את השאילתה מאפס בכל דף.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 שאילתה חוזרת חייבת להיבנות מחדש בכל דף', () => {
  /** מדמה את supabase-js: range מצטבר, ולכן דף שני מחזיר חיתוך ריק. */
  function reusableQuery(total: number) {
    const all = Array.from({ length: total }, (_, i) => ({ id: String(i) }))
    let lo = 0, hi = Infinity, used = false
    return {
      range(from: number, to: number) {
        // הצטברות: הטווח החדש נחתך עם הקודם במקום להחליפו
        lo = Math.max(lo, from); hi = Math.min(hi, to)
        used = true
        return this
      },
      then(res: (v: { data: { id: string }[]; error: null }) => void) {
        const slice = lo > hi ? [] : all.slice(lo, Math.min(hi + 1, lo + 1000))
        res({ data: slice, error: null })
      },
      get wasUsed() { return used },
    }
  }

  it('שימוש חוזר באותו אובייקט מחזיר רשימה חלקית — זה היה הבאג', async () => {
    const q = reusableQuery(7201)
    const { rows } = await fetchAllRows<{ id: string }>((from, to) => q.range(from, to) as never)
    expect(rows.length).toBeLessThan(7201)
  })

  it('בנייה מחדש בכל דף מחזירה את כל 7,201', async () => {
    const all = Array.from({ length: 7201 }, (_, i) => ({ id: String(i) }))
    const { rows } = await fetchAllRows<{ id: string }>((from, to) =>
      Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null }))
    expect(rows).toHaveLength(7201)
  })
})
