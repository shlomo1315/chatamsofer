import { describe, expect, it } from 'vitest'
import { buildLiveView, LIVE_MINUTES } from './gilyonotLive'

const T0 = Date.parse('2026-11-18T19:18:00Z')
/** שני מיילים בשנייה מ-T0, למשך n שניות */
const run = (from: number, secs: number) => Array.from({ length: secs * 2 }, (_, i) => from + Math.floor(i / 2) * 1000)

describe('buildLiveView', () => {
  it('מחשב קצב וזמן לסיום משליחה רציפה', () => {
    const times = run(T0, 600)
    const v = buildLiveView(times, 1200, { now: new Date(T0 + 600_000), status: 'sending' })
    expect(v.rate).toBe(2)
    expect(v.etaSec).toBeGreaterThanOrEqual(600)
    expect(v.etaSec).toBeLessThan(610)
    expect(v.active).toBe(true)
    expect(v.gaps).toEqual([])
    expect(v.minutes).toHaveLength(LIVE_MINUTES)
    expect(v.minutes[1].count).toBe(120)
  })

  it('מזהה עצירה באמצע ואת הנמען שממנו השליחה המשיכה', () => {
    const before = run(T0, 300) // 600 מיילים
    const after = run(T0 + 300_000 + 4 * 60_000, 60)
    const v = buildLiveView([...after, ...before], 100, { now: new Date(T0 + 10 * 60_000 + 10_000), status: 'sending' })
    expect(v.gaps).toHaveLength(1)
    expect(v.gaps[0].minutes).toBe(4)
    expect(v.gaps[0].resumedAt).toBe(601)
    expect(v.minutes.some(m => m.gap)).toBe(true)
  })

  it('עצירה שעדיין נמשכת: אין קצב ואין זמן משוער', () => {
    const v = buildLiveView(run(T0, 60), 500, { now: new Date(T0 + 20 * 60_000), status: 'sending' })
    expect(v.active).toBe(false)
    expect(v.etaSec).toBeNull()
    expect(v.gaps.at(-1)).toMatchObject({ to: null, resumedAt: null })
  })

  it('שליחה שהסתיימה: העמודות נגמרות בזמן הסיום', () => {
    const times = run(T0, 120)
    const v = buildLiveView(times, 0, { now: new Date(T0 + 5 * 3600_000), status: 'sent', completedAt: new Date(T0 + 120_000).toISOString() })
    expect(v.etaSec).toBeNull()
    expect(v.minutes.reduce((n, m) => n + m.count, 0)).toBe(240)
  })
})
