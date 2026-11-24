import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// מועד סגירת הרישום (distributions_share_closes_at) סוגר את הרישום בפועל,
// בנוסף למתג registration_open: אחד מהם סגור — הרישום סגור.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  closesAt: '' as string | undefined,
  open: [] as Record<string, unknown>[],
}))

/** מסד מדומה שמבחין בין app_settings (המועד) לבין distributions (חלוקה פתוחה). */
function fakeDb() {
  const make = (table: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
    q.maybeSingle = async () => ({
      data: table === 'app_settings'
        ? (h.closesAt === undefined ? null : { value: h.closesAt })
        : (h.open[0] ?? null),
      error: null,
    })
    return q
  }
  return { from: (t: string) => make(t) } as unknown as SupabaseClient
}

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => fakeDb() }))
vi.mock('@/lib/departmentGates', () => ({ isDepartmentOpen: async () => true }))
vi.mock('@/lib/holidayDistRules', async (orig) => ({
  ...(await orig<typeof import('@/lib/holidayDistRules')>()),
  getDistRules: async () => ({ phoneOnly: false, phoneNumber: '' }),
}))

import { isPastClosesAt } from './distributionsShareScope'
import { getOpenDistribution, isRegistrationDeadlinePassed } from './holidayDistributions'

const DIST = { id: 'd1', name: 'חנוכה', year: 'תשפ"ז', amount_per_family: 300, registration_open: true, status: 'active' }
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

beforeEach(() => { h.closesAt = undefined; h.open = [DIST] })

describe('isPastClosesAt', () => {
  const at = '2026-12-01T18:00:00.000Z'
  it('בלי מועד, או מועד לא תקין — לא עבר', () => {
    expect(isPastClosesAt(null)).toBe(false)
    expect(isPastClosesAt('')).toBe(false)
    expect(isPastClosesAt('לא תאריך')).toBe(false)
  })
  it('לפני המועד — לא; ברגע המועד ואחריו — כן', () => {
    const t = Date.parse(at)
    expect(isPastClosesAt(at, t - 1)).toBe(false)
    expect(isPastClosesAt(at, t)).toBe(true)
    expect(isPastClosesAt(at, t + 60_000)).toBe(true)
  })
})

describe('getOpenDistribution לפי מועד הסגירה', () => {
  it('לפני המועד — הרישום פתוח', async () => {
    h.closesAt = inMinutes(30)
    expect(await isRegistrationDeadlinePassed()).toBe(false)
    expect((await getOpenDistribution())?.id).toBe('d1')
  })

  it('אחרי המועד — הרישום סגור גם כש-registration_open דלוק', async () => {
    h.closesAt = inMinutes(-1)
    expect(await isRegistrationDeadlinePassed()).toBe(true)
    expect(await getOpenDistribution()).toBeNull()
  })

  it('מועד שהוסר (ריק) או שלא הוגדר מעולם — ההתנהגות הקודמת: פתוח', async () => {
    h.closesAt = ''
    expect((await getOpenDistribution())?.id).toBe('d1')
    h.closesAt = undefined
    expect((await getOpenDistribution())?.id).toBe('d1')
  })

  it('registration_open סגור — סגור גם כשהמועד עוד לא הגיע', async () => {
    h.closesAt = inMinutes(30)
    h.open = []
    expect(await getOpenDistribution()).toBeNull()
  })
})
