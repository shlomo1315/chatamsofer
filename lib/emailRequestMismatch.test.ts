import { describe, it, expect, vi, beforeEach } from 'vitest'

const deliverMail = vi.fn().mockResolvedValue(undefined)
vi.mock('./sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...a) }))
vi.mock('./departmentGates', () => ({
  isDepartmentOpen: async () => true,
  departmentClosedMessage: () => '',
}))

import { handleEmailRequest } from './emailRequestIntake'

// מסד מדומה: שאילתת beneficiaries מחזירה מוטב עם כתובת רשומה, השאר ריק.
const admin = {
  from: (table: string) => {
    const q: Record<string, unknown> = {}
    const chain = () => q
    q.select = chain; q.order = chain; q.or = chain
    q.maybeSingle = async () => ({
      data: table === 'beneficiaries'
        ? { id: 'b1', full_name: 'א', family_name: 'ב', email: 'real@gmail.com', eligibility_status: 'approved', marital_status: 'married' }
        : null,
    })
    q.then = (res: (v: unknown) => unknown) => res({ data: [] })
    return q
  },
} as never

const subject = 'בקשת הלוואה · ת.ז 123456789'

describe('אי-התאמה בכתובת השולח', () => {
  beforeEach(() => deliverMail.mockClear())

  it('מייל רגיל עם ת"ז בנושא משולח לא תואם — בלי דחייה, נשאר בתיבה', async () => {
    const handled = await handleEmailRequest(admin, {
      fromEmail: 'other@gmail.com', subject, body: 'שלום, תודה רבה', attachments: [],
    })
    expect(handled).toBe(false)
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('טופס שמולא משולח לא תואם — עדיין מקבל דחייה', async () => {
    const handled = await handleEmailRequest(admin, {
      fromEmail: 'other@gmail.com', subject,
      body: 'סכום ההלוואה המבוקש: 5000\nמספר התשלומים: 10', attachments: [],
    })
    expect(handled).toBe(true)
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })
})
