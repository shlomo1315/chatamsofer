import { describe, it, expect, vi } from 'vitest'

// הנוסחים האמיתיים מהקטלוג (ברירות המחדל), בלי מסד.
vi.mock('./emailTextsStore', async () => {
  const { textOf } = await import('./emailCatalog')
  return { textFor: (id: string, key: string) => textOf(null, id, key) }
})

const { holidayRegisteredEmail } = await import('./emailTemplates')

// מייל שנשלח מיד אחרי הרישום לחלוקת חגים (טלפון / פורטל): "הבקשה התקבלה".
// ⚠️ בשלב הזה אין עדיין אישור, סכום, מוקד או כרטיס, ולכן אסור שיופיעו במייל.
describe('מייל "הבקשה התקבלה" לחלוקת חגים', () => {
  const m = holidayRegisteredEmail('כהן חיה', { distribution: 'חנוכה תשפ״ז' })
  const all = `${m.subject}\n${m.html}`

  it('נוסח: התקבלה ותטופל, עדכון בטלפון ובמייל', () => {
    expect(m.subject).toBe('בקשתכם לחלוקת חנוכה תשפ״ז התקבלה — היכל החתם סופר')
    expect(m.html).toContain('הבקשה התקבלה')
    expect(m.html).toContain('הבקשה שלכם לחלוקת חנוכה תשפ״ז התקבלה במערכת ותטופל בהקדם.')
    expect(m.html).toContain('נשלח לכם עדכון מסודר בימים הקרובים בטלפון ובמייל.')
    expect(m.html).toContain('כהן חיה')
  })

  it('בלי "אושרה", סכום, הוראות שיוך כרטיס או מוקד', () => {
    expect(all).not.toMatch(/אושר/)
    expect(all).not.toContain('₪')
    expect(all).not.toContain('הסכום')
    expect(all).not.toMatch(/לשייך|שויך|כרטיס/)
    expect(all).not.toContain('מה עושים עכשיו')
    expect(all).not.toContain('מוקד')
    expect(all).not.toContain('אלול')
  })

  it('בלי שם חלוקה: "חלוקת החגים", ושם שכבר מתחיל ב"חלוקת" לא מוכפל', () => {
    expect(holidayRegisteredEmail('').subject).toContain('בקשתכם לחלוקת החגים התקבלה')
    expect(holidayRegisteredEmail('', { distribution: 'חלוקת פסח' }).subject).toContain('בקשתכם לחלוקת פסח התקבלה')
  })
})
