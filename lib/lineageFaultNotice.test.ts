import { describe, it, expect } from 'vitest'
import { planLineageFaultNotice, recipientNameOf, type FaultRow } from './lineageFaultNotice'
import { lineageFaultEmail } from './emailTemplates'

const row = (id: string, over: Partial<FaultRow> = {}): FaultRow => ({
  id, full_name: 'משה', family_name: 'כהן', spouse_name: null,
  email: `${id}@example.com`, lineage_node_id: `n-${id}`, ...over,
})

describe('planLineageFaultNotice', () => {
  it('מחלק לפי: כבר קיבל, בלי מייל, בלי שיוך לעץ, ולשליחה', () => {
    const plan = planLineageFaultNotice([
      row('a'),
      row('b', { email: null }),
      row('c', { email: 'לא-מייל' }),
      row('d', { lineage_node_id: null }),
      row('e'),
    ], new Set(['e']))
    expect(plan.toSend.map(r => r.id)).toEqual(['a'])
    expect(plan.noEmail.map(r => r.id)).toEqual(['b', 'c'])
    expect(plan.noLineage.map(r => r.id)).toEqual(['d'])
    expect(plan.alreadySent.map(r => r.id)).toEqual(['e'])
  })

  it('משפחה שכבר קיבלה לא נשלחת שוב גם אם אין לה מייל עכשיו', () => {
    const plan = planLineageFaultNotice([row('a', { email: null })], new Set(['a']))
    expect(plan.alreadySent).toHaveLength(1)
    expect(plan.noEmail).toHaveLength(0)
  })

  it('מנקה רווחים מהמייל', () => {
    const plan = planLineageFaultNotice([row('a', { email: '  x@y.com ' })], new Set())
    expect(plan.toSend[0].email).toBe('x@y.com')
  })
})

describe('recipientNameOf', () => {
  it('משפחה + שם בן/בת הזוג או השם המלא', () => {
    expect(recipientNameOf({ family_name: 'כהן', spouse_name: 'שרה', full_name: 'משה' })).toBe('כהן שרה')
    expect(recipientNameOf({ family_name: 'כהן', spouse_name: null, full_name: 'משה' })).toBe('כהן משה')
    expect(recipientNameOf({ family_name: null, spouse_name: null, full_name: null })).toBe('משפחה יקרה')
  })
})

describe('lineageFaultEmail', () => {
  it('מודיע על תקלה, כולל את הקישור, ומנקה את שם הנמען', () => {
    const m = lineageFaultEmail({ recipientName: 'כהן <b>', link: 'https://chasamsofer.co.il/lineage-review/abc' })
    expect(m.subject).toContain('תקלה בסדר הדורות')
    expect(m.html).toContain('התגלתה תקלה')
    expect(m.html).toContain('לא תהיה אפשרות לקבל את הכרטיס של מענק חג החנוכה')
    expect(m.html).toContain('https://chasamsofer.co.il/lineage-review/abc')
    expect(m.html).not.toContain('כהן <b>')
  })
})
