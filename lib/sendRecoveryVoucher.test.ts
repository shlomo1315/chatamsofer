import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יולדת שביקשה בטעות רק מזון, ואחר כך ביקשה גם בית החלמה — לא קיבלה
// מייל עם שובר ההבראה.
//
// השורש היה במסך העריכה (app/admin/maternity/[id]/edit), שכתב recovery_home
// ישירות למסד ועקף את /api/admin/maternity/recovery-home — הנתיב היחיד
// שקורא ל-sendRecoveryVoucherUpdate. הבדיקות כאן נועלות את הפונקציה עצמה:
// מי כן מקבל שובר, ומי נחסם ומאיזו סיבה.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deliverMail = vi.fn(async (..._a: any[]) => ({ ok: true }))

vi.mock('./sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...a) }))
vi.mock('./departments', () => ({ mailFor: () => 'maternity@example.org' }))
vi.mock('./maternityVoucher', () => ({
  buildRecoveryVoucherOnly: async () => [{ filename: 'v.pdf', mimeType: 'application/pdf', contentB64: 'AA==' }],
}))
vi.mock('./emailShell', () => ({ shell: ({ body }: { body: string }) => body }))

const { sendRecoveryVoucherUpdate } = await import('./sendRecoveryVoucher')

/** תיק יולדת מלא ותקין — כל בדיקה משנה ממנו רק את מה שהיא בודקת. */
function aidRow(over: Record<string, unknown> = {}) {
  return {
    id: 'aid-1',
    status: 'active',
    birth_type: 'live',
    birth_date: '2026-08-01',
    recovery_home: 'אם וילד',
    is_twins: false,
    recovery_eligibility_days: 2,
    voucher_serial: '01082026.1234',
    beneficiary: {
      email: 'mother@example.com',
      full_name: 'שרה', family_name: 'ישראלי',
      spouse_name: 'משה', spouse_id_number: '207212911', id_number: '123456789',
      address: 'הרצל 1', city: 'ירושלים',
      phone: '0501234567', spouse_phone: '0527654321',
    },
    ...over,
  }
}

function dbWith(row: unknown): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => deliverMail.mockClear())

describe('sendRecoveryVoucherUpdate — מי מקבל שובר הבראה', () => {
  it('🔴 יולדת מאושרת שקיבלה בית החלמה — נשלח שובר', async () => {
    // המקרה שדווח: ביקשה רק מזון, אחר כך נוסף לה בית החלמה בכרטסת.
    // אין בפונקציה שום חסימה לפי "מה ביקשה במקור" — וכך צריך להיות.
    const res = await sendRecoveryVoucherUpdate(dbWith(aidRow()), 'aid-1')
    expect(res.sent).toBe(true)
    expect(deliverMail).toHaveBeenCalledOnce()
    expect(deliverMail.mock.calls[0][0]).toBe('mother@example.com')
  })

  it('המייל כולל את שם בית ההחלמה ואת ימי הזכאות', async () => {
    await sendRecoveryVoucherUpdate(dbWith(aidRow({ recovery_home: 'טלזסטון' })), 'aid-1')
    const html = String(deliverMail.mock.calls[0][2])
    expect(html).toContain('טלזסטון')
    expect(html).toContain('2 ימים')
  })

  it('השובר מצורף כקובץ ולא רק כטקסט', async () => {
    await sendRecoveryVoucherUpdate(dbWith(aidRow()), 'aid-1')
    const attachments = deliverMail.mock.calls[0][3] as { filename: string }[]
    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('v.pdf')
  })

  it('תאומים מקבלים יותר ימי זכאות', async () => {
    await sendRecoveryVoucherUpdate(
      dbWith(aidRow({ is_twins: true, recovery_eligibility_days: null })), 'aid-1')
    expect(deliverMail).toHaveBeenCalledOnce()
  })
})

describe('מי נחסם — ומאיזו סיבה', () => {
  it('תיק שאינו קיים', async () => {
    const res = await sendRecoveryVoucherUpdate(dbWith(null), 'missing')
    expect(res).toEqual({ sent: false, reason: 'not-found' })
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('לידה שטרם אושרה — לא נשלח שובר', async () => {
    // ⚠️ מכוון: שובר ליולדת שהבקשה שלה עדיין ממתינה הוא הבטחה שלא ניתנה.
    const res = await sendRecoveryVoucherUpdate(dbWith(aidRow({ status: 'pending' })), 'aid-1')
    expect(res.reason).toBe('not-approved')
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('לידה שקטה — לא נשלח דבר', async () => {
    const res = await sendRecoveryVoucherUpdate(dbWith(aidRow({ birth_type: 'silent' })), 'aid-1')
    expect(res.reason).toBe('silent')
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('אין כתובת מייל — נחסם עם סיבה, ולא נכשל בשקט', async () => {
    const res = await sendRecoveryVoucherUpdate(
      dbWith(aidRow({ beneficiary: { email: null, family_name: 'ישראלי' } })), 'aid-1')
    expect(res.reason).toBe('no-email')
    expect(deliverMail).not.toHaveBeenCalled()
  })
})
