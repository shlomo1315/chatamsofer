import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRegistrationGate, phoneCodeLoginBlocked, phoneConfirmError, PHONE_LOGIN_OFF_MESSAGE } from './registrationGate'

const fake = (rows: { key: string; value: unknown }[]) =>
  ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }) }) }) as unknown as SupabaseClient

describe('getRegistrationGate — אימות טלפון', () => {
  it('ברירת מחדל: חובה', async () => {
    expect((await getRegistrationGate(fake([]))).phoneVerificationRequired).toBe(true)
  })
  it('כבוי רק כשהערך false מפורש', async () => {
    expect((await getRegistrationGate(fake([{ key: 'phone_verification_required', value: 'false' }]))).phoneVerificationRequired).toBe(false)
    expect((await getRegistrationGate(fake([{ key: 'phone_verification_required', value: false }]))).phoneVerificationRequired).toBe(false)
    expect((await getRegistrationGate(fake([{ key: 'phone_verification_required', value: 'true' }]))).phoneVerificationRequired).toBe(true)
    expect((await getRegistrationGate(fake([{ key: 'phone_verification_required', value: 'x' }]))).phoneVerificationRequired).toBe(true)
  })
})

describe('phoneCodeLoginBlocked — כניסה בקוד בשיחה', () => {
  it('מתג דלוק: מותר לשלוח שיחה', async () => {
    expect(phoneCodeLoginBlocked(await getRegistrationGate(fake([])))).toBeNull()
    expect(phoneCodeLoginBlocked(await getRegistrationGate(fake([{ key: 'phone_verification_required', value: 'true' }])))).toBeNull()
  })
  it('מתג כבוי: חסום, עם ההודעה המדויקת', async () => {
    const msg = phoneCodeLoginBlocked(await getRegistrationGate(fake([{ key: 'phone_verification_required', value: 'false' }])))
    expect(msg).toBe(PHONE_LOGIN_OFF_MESSAGE)
    expect(msg).toBe('כרגע אין אפשרות להיכנס למערכת דרך קוד לטלפון, רק דרך המייל. אנחנו מטפלים בתקלה ותיסדר בזמן הקרוב. עמכם הסליחה.')
  })
})

describe('phoneConfirmError — שדה אישור לטלפון ברישום', () => {
  const entries = (confirm: string) => [
    { label: 'טלפון', value: '0527101315', confirm },
    { label: 'טלפון נוסף', value: '', confirm: '' },
  ]
  it('מתג דלוק: אין שדה אישור, אין בדיקה', () => {
    expect(phoneConfirmError({ phoneVerificationRequired: true }, entries(''))).toBeNull()
  })
  it('מתג כבוי וטלפונים תואמים (גם אחרי נרמול): תקין', () => {
    expect(phoneConfirmError({ phoneVerificationRequired: false }, entries('0527101315'))).toBeNull()
    expect(phoneConfirmError({ phoneVerificationRequired: false }, entries('052-710-1315'))).toBeNull()
    expect(phoneConfirmError({ phoneVerificationRequired: false }, entries('+972527101315'))).toBeNull()
  })
  it('מתג כבוי וטלפונים לא תואמים או אישור חסר: שגיאה', () => {
    expect(phoneConfirmError({ phoneVerificationRequired: false }, entries('0527101316'))).toContain('טלפון')
    expect(phoneConfirmError({ phoneVerificationRequired: false }, entries(''))).not.toBeNull()
  })
})
