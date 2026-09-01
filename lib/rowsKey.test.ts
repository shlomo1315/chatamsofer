import { describe, it, expect } from 'vitest'
import { rowsKeyOf } from './rowsKey'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הרגרסיה של קריסת מסך החלוקה (React #301).
//
// מסך חלוקת החגים מת בלולאת רינדור אינסופית. השורש: שני ה-hooks שמאפסים
// מונה בזמן הרינדור השוו *זהות* של מערך, ו-HolidayRecipientsTable מעביר
// `filter` כפונקציה inline — ולכן tc.rows היה מערך חדש בכל רינדור גם
// כשהשורות לא השתנו כלל. ההשוואה נכשלה תמיד, setState רץ בכל רינדור,
// וכל setState בזמן רינדור מזמן רינדור נוסף.
//
// המבחן המכריע הוא הראשון: אותן שורות במערך חדש חייבות לתת אותו מפתח.
// ─────────────────────────────────────────────────────────────────────────────

const rows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i + from}`, name: `שורה ${i + from}` }))

describe('🔴 מערך חדש עם אותן שורות = אותו מפתח', () => {
  it('זה בדיוק מה שהפיל את המסך: העתק של המערך אינו "רשימה חדשה"', () => {
    const a = rows(6000)
    expect(rowsKeyOf([...a])).toBe(rowsKeyOf(a))
  })

  it('גם שרשרת נגזרת (filter → available → tc.rows) יציבה בין רינדורים', () => {
    const a = rows(6000)
    // כל "רינדור" בונה מערך חדש לגמרי מאותן שורות — כמו במסך שנפל.
    const render = () => rowsKeyOf(a.filter(() => true))
    expect(render()).toBe(render())
  })

  it('עדכון שדה בשורה באמצע אינו מקפיץ את המשתמש לעמוד 1', () => {
    const a = rows(300)
    const b = a.map((r, i) => (i === 150 ? { ...r, name: 'עודכן' } : r))
    expect(rowsKeyOf(b)).toBe(rowsKeyOf(a))
  })
})

describe('שינוי אמיתי ברשימה כן מזוהה', () => {
  it('סינון שמקצר את הרשימה', () => {
    expect(rowsKeyOf(rows(300).slice(0, 50))).not.toBe(rowsKeyOf(rows(300)))
  })

  it('מיון הפוך — האורך זהה, הקצוות התחלפו', () => {
    const a = rows(300)
    expect(rowsKeyOf([...a].reverse())).not.toBe(rowsKeyOf(a))
  })

  it('חיפוש שמחזיר טווח אחר באותו אורך', () => {
    expect(rowsKeyOf(rows(50, 100))).not.toBe(rowsKeyOf(rows(50, 1)))
  })

  it('רשימה ריקה מול מלאה', () => {
    expect(rowsKeyOf([])).not.toBe(rowsKeyOf(rows(10)))
  })
})

describe('מקרי קצה — המפתח לא זורק', () => {
  it('רשימה ריקה', () => {
    expect(rowsKeyOf([])).toBe('0::')
  })

  it('שורות בלי שדה id (למשל מחרוזות) אינן מפילות', () => {
    expect(() => rowsKeyOf(['א', 'ב'])).not.toThrow()
    expect(rowsKeyOf(['א', 'ב'])).toBe(rowsKeyOf(['ג', 'ד']))
  })

  it('null/undefined בתוך הרשימה אינם מפילים', () => {
    expect(() => rowsKeyOf([null, undefined])).not.toThrow()
  })

  it('שורה בודדת — ראשונה ואחרונה הן אותה שורה', () => {
    expect(rowsKeyOf(rows(1))).toBe('1:r1:r1')
  })
})
