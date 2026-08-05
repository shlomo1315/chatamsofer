import { describe, it, expect } from 'vitest'
import { isDeviation, genColor, deviatingGens, EARLY_DEPTH } from './lineageDeviation'

describe('isDeviation', () => {
  it('צומת שנדחה הוא חריגה בכל דור', () => {
    expect(isDeviation(3, 'rejected')).toBe(true)
    expect(isDeviation(9, 'rejected')).toBe(true)
  })

  it('צומת שאינו בעץ המאושר בתוך 5 הדורות הוא חריגה', () => {
    // צמתי הייבוא הרשמי נכנסים כ-verified, ולכן pending בדורות 2–5 = צומת שנוסף
    expect(isDeviation(2, 'pending')).toBe(true)
    expect(isDeviation(5, 'pending')).toBe(true)
  })

  it('"לא נמצא צומת תואם" בתוך 5 הדורות הוא חריגה', () => {
    // ⚠️ החלטה מודעת: כרטיס שנושא "בדיקה מעמיקה" בלי אף דור אדום משאיר את
    // המזכיר עם התראה שאין לו במה להסתכל. בליבה המאושרת "לא מצאנו את האב הזה"
    // הוא בדיוק המצב שדורש עין אנושית.
    for (let g = 2; g <= EARLY_DEPTH; g++) expect(isDeviation(g, null)).toBe(true)
  })

  it('דור מאושר אינו חריגה', () => {
    expect(isDeviation(4, 'verified')).toBe(false)
  })

  it('הוספת דורות מעל 5 היא המצב הרגיל ואינה חריגה', () => {
    expect(isDeviation(6, 'pending')).toBe(false)
    expect(isDeviation(12, null)).toBe(false)
  })

  it('דור 1 — החתם סופר — אינו נבדק, גם לא כשהצומת נדחה', () => {
    // הממשק מציג את דור 1 תמיד כמאושר, ולכן התראה עליו הייתה סותרת את הצ'יפ
    expect(isDeviation(1, 'pending')).toBe(false)
    expect(isDeviation(1, null)).toBe(false)
    expect(isDeviation(1, 'rejected')).toBe(false)
  })
})

describe('genColor', () => {
  it('מאושר → כחול', () => expect(genColor(3, 'verified')).toBe('blue'))
  it('חריגה → אדום', () => expect(genColor(3, 'pending')).toBe('red'))
  it('לא ידוע בתוך 5 הדורות → אדום', () => expect(genColor(3, null)).toBe('red'))
  it('לא ידוע מעל 5 → כתום', () => expect(genColor(9, null)).toBe('orange'))
  it('הוספה מעל 5 → כתום', () => expect(genColor(7, 'pending')).toBe('orange'))
})

describe('deviatingGens', () => {
  it('מחזיר רק את הדורות החריגים, ממוינים', () => {
    const map = new Map<number, 'verified' | 'pending' | 'rejected' | null>([
      [1, 'verified'], [2, 'verified'], [4, 'pending'], [3, 'rejected'], [5, null],
      [6, 'pending'], [7, null],
    ])
    expect(deviatingGens(map.entries())).toEqual([3, 4, 5])
  })

  it('שרשרת שלא נמצאה בליבה המאושרת — רק דורות 2–5 חריגים, לא מה שמעליהם', () => {
    const map = new Map<number, 'verified' | 'pending' | 'rejected' | null>([
      [2, null], [3, null], [4, null], [5, null], [6, null], [7, null], [8, null],
    ])
    expect(deviatingGens(map.entries())).toEqual([2, 3, 4, 5])
  })

  it('נתיב מאושר במלואו אינו מקפיץ התראה', () => {
    const map = new Map<number, 'verified' | 'pending' | 'rejected' | null>([
      [1, 'verified'], [2, 'verified'], [3, 'verified'], [4, 'verified'], [5, 'verified'],
      [6, 'pending'], [7, 'pending'],
    ])
    expect(deviatingGens(map.entries())).toEqual([])
  })
})
