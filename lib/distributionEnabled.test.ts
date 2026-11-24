import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// מתג פעילה / מושבתת לחלוקות חגים: חלוקה מושבתת לא עובדת בשום ערוץ.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))

/** לקוח מסד מדומה: כל שרשור מחזיר את עצמו, וההמתנה מחזירה את השורות. */
function fakeDb(rows: () => Record<string, unknown>[]) {
  const q: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'neq', 'order', 'limit', 'in']) q[m] = () => q
  q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
  q.then = (res: (v: unknown) => unknown) => res({ data: rows(), error: null })
  return q as unknown as SupabaseClient
}

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => fakeDb(() => h.rows) }))
vi.mock('@/lib/departmentGates', () => ({ isDepartmentOpen: async () => true }))
vi.mock('@/lib/holidayDistRules', async (orig) => ({
  ...(await orig<typeof import('@/lib/holidayDistRules')>()),
  getDistRules: async () => ({ phoneOnly: false, phoneNumber: '' }),
}))

import { isDistributionEnabled, firstEnabled, distributionDisabledError, DISTRIBUTION_DISABLED_ERROR } from './distributionEnabled'
import { getOpenDistribution, getLiveDistribution } from './holidayDistributions'
import { latestDistribution } from './telephony/main/holidaysData'

const dist = (id: string, enabled?: boolean | null) =>
  ({ id, name: `חלוקה ${id}`, year: 'תשפ"ז', amount_per_family: 500, registration_open: true, centers_open: false, status: 'active', enabled })

beforeEach(() => { h.rows = [] })

describe('isDistributionEnabled / firstEnabled', () => {
  it('רק false מפורש משבית — חסר (לפני המיגרציה) או null נחשבים פעילה', () => {
    expect(isDistributionEnabled({ enabled: true })).toBe(true)
    expect(isDistributionEnabled({})).toBe(true)
    expect(isDistributionEnabled({ enabled: null })).toBe(true)
    expect(isDistributionEnabled({ enabled: false })).toBe(false)
    expect(isDistributionEnabled(null)).toBe(false)
  })

  it('האחרונה הפעילה מדלגת על מושבתות', () => {
    expect(firstEnabled([dist('a', false), dist('b'), dist('c')])?.id).toBe('b')
    expect(firstEnabled([dist('a', false)])).toBeNull()
    expect(firstEnabled(null)).toBeNull()
  })
})

describe('distributionDisabledError — חסימת פעולות הניהול', () => {
  it('חלוקה מושבתת נחסמת עם הודעה', async () => {
    expect(await distributionDisabledError(fakeDb(() => [dist('a', false)]), 'a')).toBe(DISTRIBUTION_DISABLED_ERROR)
  })
  it('חלוקה פעילה, חלוקה בלי עמודה ומזהה חסר — מותרות', async () => {
    expect(await distributionDisabledError(fakeDb(() => [dist('a', true)]), 'a')).toBeNull()
    expect(await distributionDisabledError(fakeDb(() => [{ id: 'a' }]), 'a')).toBeNull()
    expect(await distributionDisabledError(fakeDb(() => []), 'a')).toBeNull()
    expect(await distributionDisabledError(fakeDb(() => [dist('a', false)]), '')).toBeNull()
  })
})

describe('ערוצי הרישום (פורטל, מייל, נדרים, טלפון) — getOpenDistribution', () => {
  it('חלוקה פתוחה לרישום אבל מושבתת — כאילו אין חלוקה פתוחה', async () => {
    h.rows = [dist('a', false)]
    expect(await getOpenDistribution()).toBeNull()
  })
  it('חלוקה פתוחה ופעילה — עובדת כרגיל', async () => {
    h.rows = [dist('a', true)]
    expect((await getOpenDistribution())?.id).toBe('a')
  })
})

describe('החלוקה החיה (שלב החלוקה בטלפון) — getLiveDistribution', () => {
  it('מושבתת מדולגת, והפעילה הקודמת היא החיה', async () => {
    h.rows = [dist('new', false), dist('old')]
    expect((await getLiveDistribution())?.id).toBe('old')
  })
  it('כל החלוקות מושבתות — אין חלוקה חיה', async () => {
    h.rows = [dist('a', false)]
    expect(await getLiveDistribution()).toBeNull()
  })
})

describe('שלוחת החגים — latestDistribution', () => {
  it('מדלגת על חלוקה מושבתת', async () => {
    h.rows = [dist('new', false), dist('old')]
    expect((await latestDistribution<{ id: string }>('id'))?.id).toBe('old')
  })
})
