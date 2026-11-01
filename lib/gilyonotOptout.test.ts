import { describe, it, expect } from 'vitest'
import { issueEmail } from './gilyonotSender'

const issue = { title: 'גיליון', parasha: 'וירא', intro: '', body_html: '<p>שלום</p>', design: null } as never
const T = '11111111-1111-4111-8111-111111111111'

describe('קישור הסרה', () => {
  it('נמען חיצוני מקבל קישור הסרה מכל הרשימות לפי טוקן המשלוח', () => {
    const { html, unsubscribeUrl } = issueEmail(issue, { deliveryToken: T, subscriberToken: null })
    expect(unsubscribeUrl).toContain(`/api/gilyonot/optout/${T}`)
    expect(html).toContain(`/api/gilyonot/optout/${T}`)
  })
  it('מנוי רשום מקבל את קישור ההסרה הרגיל', () => {
    const S = '22222222-2222-4222-8222-222222222222'
    expect(issueEmail(issue, { deliveryToken: T, subscriberToken: S }).unsubscribeUrl).toContain(`/api/gilyonot/unsubscribe/${S}`)
  })
})
