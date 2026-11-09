import { describe, it, expect, vi } from 'vitest'

vi.mock("./emailTextsStore", () => ({ textFor: (_id: string, key: string) => DEFAULTS[key] ?? key }))

const DEFAULTS: Record<string, string> = {
  subject: 'בקשת ההבראה ליולדת אושרה', preheader: 'ph', title: 'הבקשה אושרה', subtitle: 'ס',
  vouchers_title: 'מצורפים שוברים', vouchers_note: 'הדפיסו והביאו', vouchers_note_no_stock: 'אין מלאי',
  kicker: 'בשורה טובה', heading_suffix: 'בקשת ההבראה ליולדת אושרה', approved_note: 'הבקשה שלכם טופלה ואושרה, מזל טוב!',
  next_title: 'להמשך התהליך:', next_text: 'עליכם לפנות אל בית ההחלמה שנרשמתם{בית_החלמה} ולהשלים מולם את הרישום.',
  card_title: 'כרטיס מזון על סך 600 ₪', card_text: 'מצורף שובר', birth_details_title: 'פרטי הלידה:', ben_details_title: 'הפרטים שלך:',
}

const { birthApprovedEmail } = await import('./emailTemplates')

const ben = { family_name: 'כהן', full_name: 'שרה', spouse_name: 'שרה', id_number: '1' }
const birth = { baby_name: 'דני', birth_date: '2026-10-01', recovery_home: 'טלזסטון' }
const centers = [{ name: 'מוקד א' }]
const build = (o: { wantsCard: boolean; wantsRecovery: boolean }) =>
  birthApprovedEmail(ben as never, birth, { centers, cardInStock: true, ...o })

describe('מייל אישור לידה לפי סוג הבקשה', () => {
  it('כרטיס מזון בלבד: בלי טקסט בית החלמה', () => {
    const m = build({ wantsCard: true, wantsRecovery: false })
    expect(m.html).toContain('בקשתך לכרטיס מזון אושרה')
    expect(m.html).toContain('כרטיס מזון על סך')
    expect(m.html).not.toContain('להמשך התהליך')
    expect(m.html).not.toContain('בית ההחלמה')
    expect(m.html).not.toContain('טלזסטון')
    expect(m.subject).toContain('כרטיס המזון')
  })
  it('בית החלמה בלבד: בלי בלוק כרטיס מזון', () => {
    const m = build({ wantsCard: false, wantsRecovery: true })
    expect(m.html).toContain('להמשך התהליך')
    expect(m.html).toContain('טלזסטון')
    expect(m.html).not.toContain('כרטיס מזון על סך')
    expect(m.html).not.toContain('מוקד א')
  })
  it('שניהם: שני החלקים', () => {
    const m = build({ wantsCard: true, wantsRecovery: true })
    expect(m.html).toContain('להמשך התהליך')
    expect(m.html).toContain('כרטיס מזון על סך')
    expect(m.html).toContain('מזל טוב')
  })
})
