import { describe, it, expect } from 'vitest'
import { scopeBulkLoad, scopeBulkVoucher } from './holidayBulkScope'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מה בדיוק קורה לסימון בפעולה קבוצתית.
//
// ⚠️ הסימון חוצה עמודים ומגיע למאות שורות. ההפרש בין "סומנו 800" לבין
// "נטענו 340" חייב להיות מוסבר במספרים — אחרת הוא נראה כתקלה, והמנהל
// לוחץ שוב ושוב על אותן שורות.
//
// 🔴 הכללים כאן חייבים להיות זהים ל-eligibleForLoad בשרת. השרת הוא
// המחסום האמיתי; זה כאן קיים כדי *להראות* מראש מה יקרה.
// ─────────────────────────────────────────────────────────────────────────────

const row = (o: Partial<Parameters<typeof scopeBulkLoad>[0][number]> = {}) => ({
  id: 'r1', approval_status: 'approved', load_status: null,
  id_number: '123456782', center_id: 'c1', email: 'a@b.com', ...o,
})

describe('scopeBulkLoad — 🔴 מי ייטען', () => {
  it('מאושר, עם ת"ז, טרם נטען', () => {
    const s = scopeBulkLoad([row()])
    expect(s.eligible.map(r => r.id)).toEqual(['r1'])
  })

  it('🔴 מי שכבר נטען אינו נטען שוב — טעינה כפולה היא כסף כפול', () => {
    const s = scopeBulkLoad([row({ id: 'a', load_status: 'loaded' })])
    expect(s.eligible).toHaveLength(0)
    expect(s.alreadyLoaded).toBe(1)
  })

  it('לא מאושר — נספר בנפרד', () => {
    const s = scopeBulkLoad([row({ approval_status: 'pending' })])
    expect(s.eligible).toHaveLength(0)
    expect(s.notApproved).toBe(1)
  })

  it('⚠️ בלי ת"ז — נספר בנפרד, כי אי אפשר גם להקים בנדרים', () => {
    const s = scopeBulkLoad([row({ id_number: null })])
    expect(s.eligible).toHaveLength(0)
    expect(s.noId).toBe(1)
  })

  it('⚠️ שנכשל בעבר *כן* נכלל — זו בדיוק מטרת הניסיון החוזר', () => {
    const s = scopeBulkLoad([row({ load_status: 'failed' })])
    expect(s.eligible).toHaveLength(1)
  })

  it('⚠️ בלי מוקד עדיין נטען: הכסף אינו תלוי במוקד, רק השובר', () => {
    const s = scopeBulkLoad([row({ center_id: null })])
    expect(s.eligible).toHaveLength(1)
  })

  it('הכל ביחד — הספירה מסתכמת', () => {
    const s = scopeBulkLoad([
      row({ id: 'a' }),
      row({ id: 'b', load_status: 'loaded' }),
      row({ id: 'c', approval_status: 'pending' }),
      row({ id: 'd', id_number: '  ' }),
    ])
    expect(s.eligible.map(r => r.id)).toEqual(['a'])
    expect(s.alreadyLoaded).toBe(1)
    expect(s.notApproved).toBe(1)
    expect(s.noId).toBe(1)
  })
})

describe('scopeBulkVoucher — 🔴 למי יישלח שובר', () => {
  it('מי שבחר מוקד ויש לו מייל', () => {
    expect(scopeBulkVoucher([row()]).eligible.map(r => r.id)).toEqual(['r1'])
  })

  it('🔴 בלי מוקד אין שובר — הוא בנוי כולו סביבו', () => {
    const s = scopeBulkVoucher([row({ center_id: null })])
    expect(s.eligible).toHaveLength(0)
    expect(s.noCenter).toBe(1)
  })

  it('בלי מייל — אין לאן לשלוח', () => {
    const s = scopeBulkVoucher([row({ email: null })])
    expect(s.eligible).toHaveLength(0)
    expect(s.noEmail).toBe(1)
  })

  it('⚠️ מייל של רווחים נחשב חסר', () => {
    expect(scopeBulkVoucher([row({ email: '   ' })]).noEmail).toBe(1)
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(scopeBulkLoad([]).eligible).toEqual([])
    expect(scopeBulkVoucher([]).eligible).toEqual([])
  })
})
