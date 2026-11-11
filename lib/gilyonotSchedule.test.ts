import { describe, expect, it } from 'vitest'
import { parseScheduleAt } from './gilyonotSchedule'

const now = new Date('2026-11-11T10:00:00Z')

describe('parseScheduleAt', () => {
  it('מקבל זמן עתידי', () => {
    const r = parseScheduleAt('2026-11-12T09:00:00Z', now)
    expect(r.ok).toBe(true)
  })
  it('דוחה עבר וזמן קרוב מדי', () => {
    expect(parseScheduleAt('2026-11-11T09:00:00Z', now).ok).toBe(false)
    expect(parseScheduleAt('2026-11-11T10:01:00Z', now).ok).toBe(false)
  })
  it('דוחה ריק, זבל ושנה קדימה', () => {
    expect(parseScheduleAt('', now).ok).toBe(false)
    expect(parseScheduleAt(undefined, now).ok).toBe(false)
    expect(parseScheduleAt('לא תאריך', now).ok).toBe(false)
    expect(parseScheduleAt('2028-01-01T00:00:00Z', now).ok).toBe(false)
  })
})
