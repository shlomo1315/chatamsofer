import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRegistrationGate } from './registrationGate'

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
