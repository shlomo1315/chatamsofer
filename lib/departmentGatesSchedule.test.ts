// שער מחלקה עם תאריך פתיחה אוטומטית: לפני, אחרי, ותאימות לאחור.
import { describe, it, expect } from 'vitest'
import { resolveGates, departmentClosedMessage } from './departmentGates'

const OPEN_AT = '2026-11-10T06:00:00.000Z'
const raw = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ maternity: 'open', gemach: 'closed', financial_aid: 'closed', widows: 'closed', ...extra })

describe('resolveGates — פתיחה אוטומטית', () => {
  it('לפני התאריך: סגור, והתאריך מוחזר', () => {
    const r = resolveGates(raw({ opens_at: { gemach: OPEN_AT } }), new Date('2026-11-10T05:59:59Z'))
    expect(r.gates.gemach).toBe(false)
    expect(r.opensAt.gemach).toBe(OPEN_AT)
  })

  it('בדיוק בתאריך ואחריו: נפתח לבד', () => {
    for (const now of ['2026-11-10T06:00:00Z', '2026-12-01T00:00:00Z']) {
      const r = resolveGates(raw({ opens_at: { gemach: OPEN_AT } }), new Date(now))
      expect(r.gates.gemach).toBe(true)
      expect(r.opensAt.gemach).toBeUndefined()
    }
  })

  it('תאריך של גמ"ח לא משפיע על מחלקות אחרות', () => {
    const r = resolveGates(raw({ opens_at: { gemach: OPEN_AT } }), new Date('2027-01-01Z'))
    expect(r.gates.financial_aid).toBe(false)
    expect(r.gates.widows).toBe(false)
  })

  it('תאימות לאחור: בלי opens_at, וגם boolean ישן', () => {
    const r = resolveGates(raw(), new Date('2030-01-01Z'))
    expect(r.gates.gemach).toBe(false)
    expect(resolveGates(JSON.stringify({ gemach: true })).gates.gemach).toBe(true)
    expect(resolveGates(JSON.stringify({ gemach: false })).gates.gemach).toBe(false)
  })

  it('מחלקה פתוחה ידנית נשארת פתוחה, תאריך פגום מתעלמים', () => {
    expect(resolveGates(raw({ gemach: 'open', opens_at: { gemach: OPEN_AT } })).gates.gemach).toBe(true)
    const r = resolveGates(raw({ opens_at: { gemach: 'לא-תאריך' } }), new Date('2030-01-01Z'))
    expect(r.gates.gemach).toBe(false)
  })

  it('אין ערך שמור / ערך לא תקין → ברירת מחדל', () => {
    expect(resolveGates(null).gates.maternity).toBe(true)
    expect(resolveGates('לא json').gates.gemach).toBe(false)
  })
})

describe('departmentClosedMessage', () => {
  it('בלי תאריך: ההודעה הרגילה', () => {
    expect(departmentClosedMessage('gemach')).toBe('הגשת בקשות לגמ"ח הלוואות אינה זמינה כעת במערכת. לפרטים ניתן לפנות למזכירות.')
  })
  it('עם תאריך: מציגה מתי נפתח', () => {
    expect(departmentClosedMessage('gemach', OPEN_AT)).toContain('תיפתח אוטומטית ב-')
    expect(departmentClosedMessage('gemach', OPEN_AT)).toContain('2026')
  })
})
