import { describe, it, expect } from 'vitest'
import {
  matchesFilter, isEmptyFilter, inBucket, orNotSpecified, sanitizeSearch,
  AGE_BUCKET_DEFS, KIDS_BUCKET_DEFS, type FilterableRow,
} from './distributionFilter'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ מה שנבדק כאן הוא ההסכמה בין הסינון בשרת לזה שבלקוח.
//
// כשהם חלוקים, המונה מראה מספר אחד והרשימה מספר אחר — והמנהל אינו יודע
// לאיזה מהם להאמין בחלוקה של 6,047 משפחות.
// ─────────────────────────────────────────────────────────────────────────────

const row = (o: Partial<FilterableRow> = {}): FilterableRow => ({
  id: 'r1', source: 'portal', approval_status: 'approved',
  community: 'ויזניץ', city: 'ירושלים', age: 35, children_count: 4, ...o,
})

describe('סינון ריק', () => {
  it('מזוהה כריק', () => {
    expect(isEmptyFilter({})).toBe(true)
    expect(isEmptyFilter({ q: '', source: 'all', city: 'all' })).toBe(true)
    expect(isEmptyFilter({ q: '   ' })).toBe(true)
  })

  it('סינון כלשהו אינו ריק', () => {
    expect(isEmptyFilter({ q: 'כהן' })).toBe(false)
    expect(isEmptyFilter({ city: 'ירושלים' })).toBe(false)
    expect(isEmptyFilter({ ageBucket: '30_39' })).toBe(false)
  })
})

describe('סינון לפי שדה', () => {
  it('מקור', () => {
    expect(matchesFilter(row(), { source: 'portal' })).toBe(true)
    expect(matchesFilter(row(), { source: 'phone' })).toBe(false)
    expect(matchesFilter(row(), { source: 'all' })).toBe(true)
  })

  it('סטטוס אישור', () => {
    expect(matchesFilter(row({ approval_status: 'pending' }), { approval: 'pending' })).toBe(true)
    expect(matchesFilter(row({ approval_status: 'pending' }), { approval: 'approved' })).toBe(false)
  })

  it('🔴 ערך ריק מוצג כ"לא צוין" ואינו נעלם', () => {
    // ⚠️ משפחה בלי קהילה חייבת להופיע בפילוח, אחרת סכום הקבוצות קטן
    // מסך הכול והמנהל מחפש לאן נעלמו.
    expect(orNotSpecified(null)).toBe('לא צוין')
    expect(orNotSpecified('  ')).toBe('לא צוין')
    expect(matchesFilter(row({ community: null }), { community: 'לא צוין' })).toBe(true)
    expect(matchesFilter(row({ city: '' }), { city: 'לא צוין' })).toBe(true)
  })
})

describe('קבוצות מספריות', () => {
  it('גיל', () => {
    expect(inBucket(35, AGE_BUCKET_DEFS, '30_39')).toBe(true)
    expect(inBucket(29, AGE_BUCKET_DEFS, '30_39')).toBe(false)
    expect(inBucket(40, AGE_BUCKET_DEFS, '30_39')).toBe(false)
  })

  it('גבולות כוללים', () => {
    // ⚠️ 30 ו-39 שייכים ל-30–39. גבול פתוח מפיל שנה שלמה בין הקבוצות.
    expect(inBucket(30, AGE_BUCKET_DEFS, '30_39')).toBe(true)
    expect(inBucket(39, AGE_BUCKET_DEFS, '30_39')).toBe(true)
  })

  it('קבוצה פתוחה מלמעלה', () => {
    expect(inBucket(60, AGE_BUCKET_DEFS, '60p')).toBe(true)
    expect(inBucket(95, AGE_BUCKET_DEFS, '60p')).toBe(true)
    expect(inBucket(59, AGE_BUCKET_DEFS, '60p')).toBe(false)
  })

  it('🔴 ערך לא ידוע אינו שייך לשום קבוצה', () => {
    // ⚠️ גיל לא ידוע אינו "0". שיוכו לקבוצה הצעירה היה מנפח אותה
    // בעשרות משפחות שאיננו יודעים עליהן דבר.
    expect(inBucket(null, AGE_BUCKET_DEFS, 'u30')).toBe(false)
    expect(inBucket(undefined, KIDS_BUCKET_DEFS, '0_2')).toBe(false)
  })

  it('⚠️ אבל כן נכלל ב"הכל"', () => {
    expect(inBucket(null, AGE_BUCKET_DEFS, 'all')).toBe(true)
  })

  it('ילדים — 0 הוא ערך אמיתי ולא "חסר"', () => {
    expect(inBucket(0, KIDS_BUCKET_DEFS, '0_2')).toBe(true)
  })
})

describe('חיפוש חופשי', () => {
  it('מוצא לפי haystack', () => {
    expect(matchesFilter(row(), { q: 'כהן' }, 'משה כהן ירושלים')).toBe(true)
    expect(matchesFilter(row(), { q: 'לוי' }, 'משה כהן ירושלים')).toBe(false)
  })

  it('⚠️ חיפוש ריק מחזיר הכל', () => {
    expect(matchesFilter(row(), { q: '   ' }, '')).toBe(true)
  })

  it('אינו תלוי רישיות', () => {
    expect(matchesFilter(row(), { q: 'COHEN' }, 'moshe cohen')).toBe(true)
  })
})

describe('סינונים מצטברים', () => {
  it('🔴 כל התנאים חייבים להתקיים', () => {
    const f = { source: 'portal', city: 'ירושלים', ageBucket: '30_39', q: 'כהן' }
    expect(matchesFilter(row(), f, 'משה כהן')).toBe(true)
    expect(matchesFilter(row({ city: 'בני ברק' }), f, 'משה כהן')).toBe(false)
    expect(matchesFilter(row({ age: 50 }), f, 'משה כהן')).toBe(false)
    expect(matchesFilter(row(), f, 'משה לוי')).toBe(false)
  })
})

describe('🔴 ניקוי קלט לשאילתה', () => {
  it('פסיק וסוגריים מוסרים', () => {
    // ⚠️ פסיק מפריד תנאים ב-or() של PostgREST, וסוגריים סוגרים את
    // הביטוי. בלי הניקוי הקלט היה מייצר תנאי אחר ממה שהמשתמש ביקש.
    expect(sanitizeSearch('כהן,לוי')).not.toContain(',')
    expect(sanitizeSearch('a(b)c')).not.toContain('(')
    expect(sanitizeSearch('a(b)c')).not.toContain(')')
  })

  it('תווי ilike מנוטרלים', () => {
    // מי שמחפש "50%" מתכוון לתו עצמו, לא לתו כללי.
    expect(sanitizeSearch('50%')).toBe('50\\%')
    expect(sanitizeSearch('a_b')).toBe('a\\_b')
  })

  it('רווחים כפולים מתמזגים והקצוות נחתכים', () => {
    expect(sanitizeSearch('  משה   כהן  ')).toBe('משה כהן')
  })

  it('⚠️ קלט ארוך נחתך — שאילתה ענקית אינה עוזרת לאיש', () => {
    expect(sanitizeSearch('א'.repeat(500)).length).toBeLessThanOrEqual(80)
  })

  it('⚠️ קלט ריק אינו זורק', () => {
    expect(sanitizeSearch('')).toBe('')
    expect(sanitizeSearch(null as unknown as string)).toBe('')
  })
})
