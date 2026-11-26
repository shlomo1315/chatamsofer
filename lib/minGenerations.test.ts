import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn() }))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/emailTextsStore', () => ({ ensureEmailTexts: vi.fn() }))

import {
  generationsStatus, registrantGeneration, tooFewGenerations, tooFewReason, isTooFewReason, tooFewMessage,
} from './minGenerations'
import { autoSendSkipReason } from './lineageInquiry'

const chainTo = (gen: number) =>
  Array.from({ length: gen }, (_, i) => ({ generation: i + 1, name: `דור ${i + 1}` }))
const pass = async () => ({ deep: false, reason: null })
const fail = async () => ({ deep: true, reason: 'דור 3 אינו תואם' })

describe('registrantGeneration / tooFewGenerations', () => {
  it('הדור של הנרשם הוא הדור הגבוה בשרשרת', () => {
    expect(registrantGeneration(chainTo(5))).toBe(5)
    expect(registrantGeneration([])).toBeNull()
    expect(registrantGeneration(null)).toBeNull()
  })
  it('פחות משבעה = טעות; שבעה ומעלה תקין; בלי שרשרת אין קביעה', () => {
    expect(tooFewGenerations(4)).toBe(true)
    expect(tooFewGenerations(6)).toBe(true)
    expect(tooFewGenerations(7)).toBe(false)
    expect(tooFewGenerations(null)).toBe(false)
  })
  it('הודעה למשפחה: "שימו לב, יש טעות בסדר הדורות שלכם"', () => {
    expect(tooFewMessage(4)).toContain('שימו לב, יש טעות בסדר הדורות שלכם')
  })
})

describe('generationsStatus', () => {
  it('נרשם עם פחות משבעה דורות → נדחה מיד, עם הסיבה', async () => {
    const r = await generationsStatus({ status: 'pending', reason: null }, 4, pass)
    expect(r).toEqual({ eligibility_status: 'rejected', deep_review_reason: tooFewReason(4) })
    expect(isTooFewReason(r!.deep_review_reason)).toBe(true)
  })
  it('גם מבדיקה מעמיקה, בעריכה מאוחרת → נדחה', async () => {
    const r = await generationsStatus({ status: 'deep_review', reason: 'דור 3 אינו תואם' }, 5, pass)
    expect(r?.eligibility_status).toBe('rejected')
  })
  it('תיקון תקין (7+ ו-5 הדורות תואמים) → ממתין לאישור ראשוני', async () => {
    const r = await generationsStatus({ status: 'rejected', reason: tooFewReason(4) }, 8, pass)
    expect(r).toEqual({ eligibility_status: 'pending', deep_review_reason: null })
  })
  it('תיקון עם 7+ אבל 5 הדורות לא תואמים → בדיקה מעמיקה', async () => {
    const r = await generationsStatus({ status: 'rejected', reason: tooFewReason(4) }, 8, fail)
    expect(r).toEqual({ eligibility_status: 'deep_review', deep_review_reason: 'דור 3 אינו תואם' })
  })
  it('תיקון שעדיין פחות משבעה → נשאר נדחה', async () => {
    const r = await generationsStatus({ status: 'rejected', reason: tooFewReason(4) }, 6, pass)
    expect(r).toEqual({ eligibility_status: 'rejected', deep_review_reason: tooFewReason(6) })
  })
  it('נדחה מסיבה אחרת לא משתחרר ולא נדרס', async () => {
    expect(await generationsStatus({ status: 'rejected', reason: 'החלטת מזכירות' }, 8, pass)).toBeNull()
    expect(await generationsStatus({ status: 'rejected', reason: 'החלטת מזכירות' }, 4, pass)).toBeNull()
  })
  it('מאושר לא נוגעים; תקין ולא נדחה → המסלול הרגיל', async () => {
    expect(await generationsStatus({ status: 'approved', reason: null }, 4, pass)).toBeNull()
    expect(await generationsStatus({ status: 'pending', reason: null }, 9, pass)).toBeNull()
  })
})

describe('קישור לתיקון למי שנדחה בגלל הדורות', () => {
  const ben = { eligibility_status: 'rejected', deep_review_reason: tooFewReason(4), lineage_node_id: 'n1', email: 'a@b.co' }
  it('נשלח אוטומטית', () => {
    expect(autoSendSkipReason(ben)).toBeNull()
  })
  it('נדחה מסיבה אחרת לא מקבל קישור', () => {
    expect(autoSendSkipReason({ ...ben, deep_review_reason: 'החלטת מזכירות' })).not.toBeNull()
  })
})
