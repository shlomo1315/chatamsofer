import { describe, it, expect } from 'vitest'
import { parseIdList, planLoanImport } from './loansPortalImport'
import { matchesLoanStage } from './loansPortalFilter'

const loan = (id: string, idn: string, extra = {}) =>
  ({ id, status: 'approved', disbursed_at: null, beneficiary: { id_number: idn }, ...extra })

describe('parseIdList', () => {
  it('מפרק שורות ופסיקים, מסיר כפילויות ואפסים מובילים', () => {
    expect(parseIdList('012345678\n12345678, 22222222 ;abc\n\n')).toEqual(['12345678', '22222222'])
  })
})

describe('planLoanImport', () => {
  it('מסמן הלוואה ממתינה, ומדווח על לא נמצא ועל כפילות', () => {
    const plan = planLoanImport(['111', '222', '333', '444'], [
      loan('a', '0111'),
      loan('b', '333'), loan('c', '333'),
      loan('d', '444', { disbursed_at: '2026-01-01', status: 'active' }),
    ])
    expect(plan.loanIds).toEqual(['a'])
    expect(plan.ambiguous).toEqual(['333'])
    expect(plan.notFound).toEqual(['222', '444'])
  })

  it('הלוואה שסומנה בוצעה לא נחשבת עוד "נשלח שטר" או "ממתין"', () => {
    const done = { note_sent_at: '2026-10-01', disbursed_at: '2026-10-20' }
    expect(matchesLoanStage(done, 'note_sent')).toBe(false)
    expect(matchesLoanStage(done, 'pending')).toBe(false)
    expect(matchesLoanStage(done, 'done')).toBe(true)
  })
})
