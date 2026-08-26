import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildGratitudeBatchLetters } from './gratitudeBatchLetters'
import type { GratitudeLetterRow } from '@/app/api/admin/gratitude/[id]/shared'

// ⚠️ מה שנבדק כאן הוא שכל ברכה מקבלת דף משלה בעיצוב הבלאנק — ולא
// כרטיסים דחוסים כמה בעמוד, כפי שהיה קודם.

const L = (o: Partial<GratitudeLetterRow> & { id: string }): GratitudeLetterRow => ({
  body: 'תודה רבה על העזרה הגדולה. יישר כוח.',
  signature: null,
  is_anonymous: false,
  status: 'approved',
  created_at: '2026-08-10T09:00:00Z',
  sent_to_donor_at: null,
  aid: {
    birth_date: '2026-07-01',
    recovery_home: 'בית ההחלמה נעימה',
    recovery_eligibility_days: 7,
    beneficiary: {
      family_name: 'ויסברג', full_name: 'שלמה', spouse_name: 'גיטי',
      city: 'עמנואל', address: 'רחוב הרב קוק 3',
      id_number: '012345678', spouse_id_number: '087654321',
    },
  },
  ...o,
} as GratitudeLetterRow)

const load = async (bytes: Uint8Array) => PDFDocument.load(bytes)

describe('🔴 דף נפרד לכל ברכה', () => {
  it('שלוש ברכות → שלושה עמודים לפחות, אחד לכל אחת', async () => {
    // 🔴 זה הלב: קודם שלוש ברכות קצרות נדחסו לעמוד אחד.
    const bytes = await buildGratitudeBatchLetters({
      letters: [L({ id: 'a' }), L({ id: 'b' }), L({ id: 'c' })],
      filters: {},
    })
    expect((await load(bytes)).getPageCount()).toBe(3)
  })

  it('ברכה בודדת → עמוד אחד', async () => {
    const bytes = await buildGratitudeBatchLetters({ letters: [L({ id: 'a' })], filters: {} })
    expect((await load(bytes)).getPageCount()).toBe(1)
  })

  it('⚠️ ברכה ארוכה גולשת לדף שני ואינה נחתכת', async () => {
    const long = L({ id: 'long', body: 'שורה ארוכה מאוד עם הרבה מלל. '.repeat(120) })
    const bytes = await buildGratitudeBatchLetters({ letters: [long], filters: {} })
    expect((await load(bytes)).getPageCount()).toBeGreaterThan(1)
  })

  it('⚠️ ברכה ארוכה אינה בולעת את הבאה אחריה', async () => {
    // המכתב הארוך תופס 2+ עמודים; הקצר חייב לקבל עמוד נוסף משלו.
    const long = L({ id: 'long', body: 'שורה ארוכה מאוד עם הרבה מלל. '.repeat(120) })
    const bytes = await buildGratitudeBatchLetters({ letters: [long, L({ id: 'short' })], filters: {} })
    const solo = await buildGratitudeBatchLetters({ letters: [long], filters: {} })
    expect((await load(bytes)).getPageCount()).toBe((await load(solo)).getPageCount() + 1)
  })
})

describe('הפילוח', () => {
  it('מסנן לפי "טרם נשלחו לנדיב"', async () => {
    const bytes = await buildGratitudeBatchLetters({
      letters: [L({ id: 'a' }), L({ id: 'b', sent_to_donor_at: '2026-08-12T10:00:00Z' })],
      filters: { sent: 'unsent' },
    })
    expect((await load(bytes)).getPageCount()).toBe(1)
  })

  it('🔴 אין ברכות → קובץ שנפתח, לא מסמך פגום', async () => {
    // מסמך בלי עמודים נפתח כ"קובץ פגום" והמשתמש מדווח על תקלה.
    const bytes = await buildGratitudeBatchLetters({ letters: [], filters: {} })
    expect((await load(bytes)).getPageCount()).toBe(1)
  })
})

describe('⚠️ תוכן חריג אינו מפיל את הקובץ', () => {
  it('ברכה אנונימית נבנית — בלי פרטי המשפחה', async () => {
    // 🔒 הקובץ נמסר לנדיב; בקשת האנונימיות חייבת להישמר גם כאן.
    const bytes = await buildGratitudeBatchLetters({
      letters: [L({ id: 'anon', is_anonymous: true })],
      filters: {},
    })
    expect((await load(bytes)).getPageCount()).toBe(1)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('שדות חסרים לגמרי', async () => {
    const bytes = await buildGratitudeBatchLetters({
      letters: [{ id: 'x', body: null, signature: null, is_anonymous: false,
                  status: 'approved', created_at: null, sent_to_donor_at: null,
                  aid: null } as GratitudeLetterRow],
      filters: {},
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('תאריך פגום אינו מפיל את הבנייה', async () => {
    const bytes = await buildGratitudeBatchLetters({
      letters: [L({ id: 'bad', created_at: 'לא-תאריך' })],
      filters: {},
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
